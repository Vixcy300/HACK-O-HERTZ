"""
Risk & Spend Intelligence Engine
==================================
ML-inspired scoring engine for detecting dirty spend patterns,
high-risk transactions, and income/expense anomalies.

Risk Scoring:
  0-30   → Safe / Normal
  31-60  → Warning (monitor)
  61-80  → High Risk (alert user)
  81-100 → Critical (strong alert + block suggestion)

Algorithms used:
  - Z-score anomaly detection on transaction amounts
  - Category-based risk weighting
  - Time-pattern analysis (late night, weekend splurge)
  - Merchant reputation scoring
  - Velocity checks (multiple transactions in short time)
  - Percent-of-income heuristic
"""

from __future__ import annotations

import math
import re
import statistics
from datetime import datetime, timedelta
from typing import Optional
from app.sms_parser import ParsedSMS


# ── Category Risk Weights ──────────────────────
# Higher = riskier for financial health
CATEGORY_RISK_WEIGHTS: dict[str, float] = {
    'entertainment': 0.85,
    'shopping':      0.80,
    'food':          0.60,   # dining out (not groceries)
    'gaming':        0.90,
    'alcohol':       0.95,
    'gambling':      1.00,
    'transport':     0.30,
    'utilities':     0.05,
    'healthcare':    0.05,
    'education':     0.05,
    'rent':          0.10,
    'investment':    0.10,
    'other':         0.50,
}

# ── High-Risk Merchant Keywords ────────────────
HIGH_RISK_MERCHANTS = {
    'betway', 'dream11', 'mpl', 'my11circle', 'fantasy',
    'casino', 'lotto', 'bet365', 'bwin', 'sportsbet',
    'liquor', 'wine', 'whisky', 'vodka', 'rum', 'beer shop',
    'bar ', 'pub ', 'club '
}

MEDIUM_RISK_MERCHANTS = {
    'swiggy', 'zomato', 'ola eat', 'food',
    'netflix', 'amazon prime', 'hotstar', 'disney', 'prime video',
    'spotify', 'wynk', 'gaana',
    'myntra', 'nykaa', 'ajio', 'jabong',
    'bigbazaar', 'dmart', 'reliance smart',
}

# ── Necessity / Low-Risk Merchants ─────────────
LOW_RISK_MERCHANTS = {
    'hospital', 'pharmacy', 'medical', 'bescom', 'tneb', 'bsnl',
    'jio fiber', 'airtel', 'vi recharge', 'school', 'college',
    'insurance', 'lic', 'irctc', 'metro', 'petrol', 'fuel'
}

# ── Threshold for "high value" transaction ─────
HIGH_VALUE_THRESHOLD_INR = 2000.0   # amounts above this get extra scrutiny
CRITICAL_VALUE_THRESHOLD_INR = 10000.0


class TransactionRiskScore:
    """Result of risk analysis for a single transaction."""
    def __init__(
        self,
        score: float,
        level: str,
        is_dirty_spend: bool,
        needs_clarification: bool,
        alert_message: str,
        suggestion: str,
        factors: list[str],
        auto_category: str,
        is_necessity: bool,
    ):
        self.score = round(score, 1)
        self.level = level            # 'safe' | 'warning' | 'high_risk' | 'critical'
        self.is_dirty_spend = is_dirty_spend
        self.needs_clarification = needs_clarification
        self.alert_message = alert_message
        self.suggestion = suggestion
        self.factors = factors
        self.auto_category = auto_category
        self.is_necessity = is_necessity

    def to_dict(self) -> dict:
        return {
            "score": self.score,
            "level": self.level,
            "is_dirty_spend": self.is_dirty_spend,
            "needs_clarification": self.needs_clarification,
            "alert_message": self.alert_message,
            "suggestion": self.suggestion,
            "factors": self.factors,
            "auto_category": self.auto_category,
            "is_necessity": self.is_necessity,
        }


def _merchant_risk_multiplier(merchant: Optional[str]) -> tuple[float, str]:
    """
    Returns (multiplier, category_hint).
    multiplier 0.0 = low risk, 1.0 = maximum risk.
    """
    if not merchant:
        return 0.5, 'other'

    m_lower = merchant.lower()

    # Low risk override
    for kw in LOW_RISK_MERCHANTS:
        if kw in m_lower:
            return 0.05, 'essential'

    # High risk
    for kw in HIGH_RISK_MERCHANTS:
        if kw in m_lower:
            return 0.95, 'entertainment'

    # Medium risk
    for kw in MEDIUM_RISK_MERCHANTS:
        if kw in m_lower:
            return 0.65, 'entertainment'

    return 0.45, 'other'


def _z_score_amount(amount: float, history_amounts: list[float]) -> float:
    """
    Compute z-score of amount vs historical transactions.
    High z-score = unusual amount.
    """
    if len(history_amounts) < 3:
        return 0.0
    try:
        mean = statistics.mean(history_amounts)
        std = statistics.stdev(history_amounts)
        if std == 0:
            return 0.0
        return abs((amount - mean) / std)
    except Exception:
        return 0.0


def _time_risk(transaction_time: Optional[datetime]) -> float:
    """Late night (10pm-5am) transactions get higher risk."""
    if not transaction_time:
        return 0.0
    hour = transaction_time.hour
    if 22 <= hour or hour <= 5:
        return 0.3   # late-night premium
    if transaction_time.weekday() in (5, 6):  # Weekend
        return 0.1
    return 0.0


def _velocity_risk(
    recent_transactions: list[dict],
    window_minutes: int = 30,
) -> float:
    """Multiple transactions in short window = higher risk."""
    now = datetime.utcnow()
    cutoff = now - timedelta(minutes=window_minutes)
    recent_count = sum(
        1 for t in recent_transactions
        if datetime.fromisoformat(t.get('timestamp', '1970-01-01')) > cutoff
    )
    if recent_count >= 5:
        return 0.5
    if recent_count >= 3:
        return 0.25
    return 0.0


def _income_percent_risk(amount: float, monthly_income: float) -> float:
    """High percent of monthly income spent in a single transaction."""
    if monthly_income <= 0:
        return 0.0
    pct = amount / monthly_income
    if pct >= 0.5:
        return 0.9
    if pct >= 0.3:
        return 0.6
    if pct >= 0.15:
        return 0.3
    if pct >= 0.05:
        return 0.1
    return 0.0


def score_transaction(
    parsed: ParsedSMS,
    monthly_income: float = 0.0,
    amount_history: Optional[list[float]] = None,
    recent_transactions: Optional[list[dict]] = None,
    transaction_time: Optional[datetime] = None,
) -> TransactionRiskScore:
    """
    Compute a risk score for a parsed bank SMS transaction.

    Args:
        parsed: ParsedSMS object from sms_parser
        monthly_income: User's monthly income for percent-of-income check
        amount_history: List of past transaction amounts (for z-score)
        recent_transactions: List of recent transaction dicts (for velocity)
        transaction_time: Datetime of the transaction

    Returns:
        TransactionRiskScore with detailed breakdown
    """
    amount = parsed.amount or 0.0
    merchant = parsed.merchant or ''
    if not transaction_time:
        transaction_time = datetime.utcnow()

    # ══════════════════════════════════════════════
    # EARLY RETURN: Credits are INCOME — never risky
    # ══════════════════════════════════════════════
    if parsed.transaction_type == 'credit':
        # Classify income source for a smarter message
        sms_lower = parsed.raw_sms.lower()
        if any(w in sms_lower for w in ['salary', 'sal credit', 'payroll', 'ctc']):
            msg = f"💼 Salary credited: ₹{amount:,.0f}"
            src = "Salary / Employer"
            income_cat = 'salary'
        elif any(w in sms_lower for w in ['refund', 'cashback', 'reversal', 'returned']):
            msg = f"↩️ Refund received: ₹{amount:,.0f}"
            src = "Refund / Cashback"
            income_cat = 'refund'
        elif any(w in sms_lower for w in ['interest', 'dividend', 'mutual fund', 'mf', 'redemption']):
            msg = f"📈 Investment return: ₹{amount:,.0f}"
            src = "Investment / Interest"
            income_cat = 'investment'
        elif any(w in sms_lower for w in ['neft', 'imps', 'rtgs']) and not merchant:
            msg = f"🏦 Bank transfer received: ₹{amount:,.0f}"
            src = "Bank Transfer"
            income_cat = 'transfer'
        elif parsed.transaction_mode == 'UPI':
            sender = merchant or 'UPI sender'
            msg = f"💰 UPI payment received: ₹{amount:,.0f} from {sender}"
            src = sender
            income_cat = 'upi_credit'
        else:
            msg = f"💰 Money received: ₹{amount:,.0f}"
            src = merchant or "Unknown"
            income_cat = 'other'

        return TransactionRiskScore(
            score=0.0,
            level='safe',
            is_dirty_spend=False,
            needs_clarification=False,
            alert_message=msg,
            suggestion=f"₹{amount:,.0f} has been auto-added to your income tracker from {src}.",
            factors=[f"Credit transaction — income from {src}"],
            auto_category=income_cat,
            is_necessity=True,
        )

    # ══════════════════════════════════════════════
    # DEBIT / EXPENSE risk scoring below
    # ══════════════════════════════════════════════
    factors: list[str] = []
    score = 0.0
    sms_lower = parsed.raw_sms.lower()

    # ── Detect necessity payments first (override merchant risk) ─────
    _NECESSITY_PATTERNS = [
        'cc bill', 'credit card bill', 'credit card payment',
        'emi', 'loan payment', 'loan emi', 'home loan', 'car loan', 'personal loan',
        'insurance', 'lic', 'health insurance', 'term plan',
        'electricity', 'bescom', 'tneb', 'msedcl', 'bses', 'bill payment',
        'broadband', 'jio fiber', 'airtel fiber',
        'school fee', 'college fee', 'tuition fee', 'exam fee',
        'rent', 'maintenance', 'society fee',
    ]
    is_necessity_payment = any(pat in sms_lower for pat in _NECESSITY_PATTERNS)

    # ── Detect P2P UPI (person-to-person transfer) ───────────────────
    # e.g. 9841234567@ybl, +918838433329 → lower risk (personal payment)
    _m = merchant.lower()
    is_p2p_upi = bool(
        re.match(r'^[+]?91?[6-9][0-9]{9}(@|$)', _m)
        or re.match(r'^[0-9]{10}(@|$)', _m)
        or (parsed.transaction_mode == 'UPI' and re.match(r'^[0-9@]+$', _m.replace('+', '')))
    )

    # ── Factor 1: Merchant risk ──────────────────
    if is_necessity_payment:
        # Necessary bills: near-zero risk
        merch_mult, auto_cat = 0.05, 'essential'
        factors.append("Necessity payment (bill / EMI / insurance)")
    elif is_p2p_upi:
        # Person-to-person transfer: low–medium risk (might still be unnecessary)
        merch_mult, auto_cat = 0.25, 'transfer'
        factors.append("Peer-to-peer UPI transfer")
    else:
        merch_mult, auto_cat = _merchant_risk_multiplier(merchant)
        if merch_mult > 0.7:
            factors.append(f"High-risk merchant: {merchant or 'Unknown'}")
        elif merch_mult > 0.4:
            factors.append(f"Non-essential merchant: {merchant or 'Unknown'}")

    score += merch_mult * 35

    # ── Factor 2: Amount magnitude ───────────────
    if amount >= CRITICAL_VALUE_THRESHOLD_INR and not is_necessity_payment:
        score += 25
        factors.append(f"Very high amount: ₹{amount:,.0f}")
    elif amount >= HIGH_VALUE_THRESHOLD_INR and not is_necessity_payment:
        score += 12
        factors.append(f"High-value purchase: ₹{amount:,.0f}")

    # ── Factor 3: Percent of monthly income ──────
    if not is_necessity_payment:
        income_risk = _income_percent_risk(amount, monthly_income)
        score += income_risk * 20
        if income_risk > 0.3:
            pct = (amount / monthly_income * 100) if monthly_income > 0 else 0
            factors.append(f"Spent {pct:.0f}% of monthly income in one transaction")
    else:
        income_risk = 0.0

    # ── Factor 4: Z-score anomaly ────────────────
    z = _z_score_amount(amount, amount_history or [])
    if z > 3.0 and not is_necessity_payment:
        score += 10
        factors.append(f"Statistically unusual amount (z={z:.1f}σ)")
    elif z > 2.0 and not is_necessity_payment:
        score += 5

    # ── Factor 5: Time-of-day risk ───────────────
    time_risk = _time_risk(transaction_time)
    score += time_risk * 10
    if time_risk > 0.2:
        factors.append("Late-night transaction (unusual spending pattern)")

    # ── Factor 6: Transaction velocity ───────────
    vel_risk = _velocity_risk(recent_transactions or [])
    score += vel_risk * 10
    if vel_risk > 0.2:
        factors.append("Multiple transactions in short time window")

    # ── Cap score at 100 ─────────────────────────
    score = min(score, 100.0)

    # ── Determine risk level ─────────────────────
    if score >= 80:
        level = 'critical'
    elif score >= 60:
        level = 'high_risk'
    elif score >= 30:
        level = 'warning'
    else:
        level = 'safe'

    is_dirty_spend = (
        score >= 50
        and not is_necessity_payment
        and not is_p2p_upi
        and (merch_mult > 0.5 or auto_cat in ('entertainment', 'gaming', 'alcohol', 'gambling'))
    )
    is_necessity = is_necessity_payment or merch_mult <= 0.1 or auto_cat == 'essential'

    # ── Build human-readable messages ────────────
    if is_necessity_payment:
        alert_message = f"✅ Bill / EMI payment: ₹{amount:,.0f} — auto tracked."
        suggestion = "Necessary payment logged. Stay on top of your bills!"
        needs_clarification = False
    elif is_p2p_upi:
        alert_message = f"👤 Sent ₹{amount:,.0f} to {merchant or 'a person'} via UPI."
        suggestion = "Personal UPI transfer logged. Mark it as a gift, split, or loan repayment if needed."
        needs_clarification = amount >= HIGH_VALUE_THRESHOLD_INR  # only ask for large P2P amounts
    elif score >= 80:
        alert_message = f"🚨 Critical Spend Alert! ₹{amount:,.0f} may be a dirty spend."
        suggestion = "This looks like a high-risk, non-essential purchase. Track it carefully and consider cutting back."
        needs_clarification = True
    elif score >= 60:
        alert_message = f"⚠️ High Risk Spend: ₹{amount:,.0f} detected. Is this necessary?"
        suggestion = "Consider saving this amount instead. What did you buy?"
        needs_clarification = True
    elif score >= 30:
        alert_message = f"💡 Heads up! ₹{amount:,.0f} purchase detected. Let's make sure it's budgeted."
        suggestion = "Non-essential spend. Make sure it fits your monthly budget."
        needs_clarification = amount >= HIGH_VALUE_THRESHOLD_INR
    else:
        alert_message = f"✅ ₹{amount:,.0f} debit looks normal."
        suggestion = "Normal spend. Keep it up!"
        needs_clarification = False

    # ── Map auto_cat to expense category ─────────
    expense_cat_map = {
        'essential': 'utilities',
        'entertainment': 'entertainment',
        'food': 'food',
        'transport': 'transport',
        'gaming': 'entertainment',
        'alcohol': 'entertainment',
        'gambling': 'entertainment',
        'transfer': 'other',
        'other': 'other',
    }
    expense_category = expense_cat_map.get(auto_cat, 'other')

    return TransactionRiskScore(
        score=score,
        level=level,
        is_dirty_spend=is_dirty_spend,
        needs_clarification=needs_clarification,
        alert_message=alert_message,
        suggestion=suggestion,
        factors=factors,
        auto_category=expense_category,
        is_necessity=is_necessity,
    )


def classify_income_sms(parsed: ParsedSMS) -> dict:
    """
    Classify an incoming credit SMS and return income metadata.
    Detects UPI income, salary, freelance payment, etc.
    """
    merchant = (parsed.merchant or '').lower()
    sms = parsed.raw_sms.lower()

    if any(w in sms for w in ['salary', 'sal credit', 'payroll']):
        return {"category": "salary", "source_name": "Employer", "confidence": 0.95}
    if any(w in sms for w in ['upwork', 'fiverr', 'toptal', 'freelancer', 'payoneer']):
        return {"category": "freelance", "source_name": parsed.merchant or "Freelance Platform", "confidence": 0.90}
    if any(w in sms for w in ['swiggy', 'zomato', 'uber', 'ola', 'dunzo', 'blinkit']):
        return {"category": "delivery", "source_name": parsed.merchant or "Delivery Platform", "confidence": 0.85}
    if 'youtube' in merchant or 'google adsense' in merchant:
        return {"category": "content", "source_name": "YouTube/AdSense", "confidence": 0.90}
    if any(w in sms for w in ['neft', 'imps', 'rtgs']):
        return {"category": "other", "source_name": parsed.merchant or "Bank Transfer", "confidence": 0.70}
    if parsed.transaction_mode == 'UPI':
        return {"category": "other", "source_name": parsed.merchant or "UPI Transfer", "confidence": 0.60}

    return {"category": "other", "source_name": parsed.merchant or "Unknown", "confidence": 0.40}
