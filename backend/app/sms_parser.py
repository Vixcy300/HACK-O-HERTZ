"""
Indian Bank SMS Parser
=======================
Parses bank SMS messages from major Indian banks (HDFC, SBI, ICICI, Axis, Kotak, PNB, BOI, etc.)
to extract structured transaction data.

Supports:
  - UPI debits/credits
  - Card transactions
  - NEFT/IMPS/RTGS transfers
  - ATM withdrawals
  - EMI payments
  - Account balance alerts
"""

import re
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime


@dataclass
class ParsedSMS:
    """Structured representation of a parsed bank SMS."""
    is_transaction: bool = False
    transaction_type: Optional[str] = None   # "credit" | "debit"
    amount: Optional[float] = None
    account_number: Optional[str] = None     # masked, e.g. "XX1234"
    merchant: Optional[str] = None           # merchant/recipient name
    transaction_mode: Optional[str] = None   # "UPI" | "CARD" | "NEFT" | "IMPS" | "ATM" | "EMI"
    bank_name: Optional[str] = None
    ref_number: Optional[str] = None
    available_balance: Optional[float] = None
    raw_sms: str = ""
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    sender_id: Optional[str] = None
    category_hint: Optional[str] = None      # AI-suggested category hint
    is_income: bool = False
    is_expense: bool = False


# ──────────────────────────────────────────────
# Regex patterns for common Indian bank SMS formats
# ──────────────────────────────────────────────

# Amount patterns: Rs.2000, INR 2,000.00, ₹2000, Rs 2,000
_AMOUNT_PATTERN = re.compile(
    r'(?:Rs\.?|INR|₹)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)',
    re.IGNORECASE
)

# Account number (masked): XX1234, x-1234, xxxxxx1234, A/C no XX1234
_ACCOUNT_PATTERN = re.compile(
    r'(?:A/C(?:\s*(?:no\.?|#))?\s*|acct?\.?\s*|account\s*(?:no\.?\s*)?)'
    r'([Xx*·•]{1,8}[0-9]{4})',
    re.IGNORECASE
)
# Simpler masked number fallback: XX1234, *1234, xxxxxx1234
_ACCOUNT_PATTERN2 = re.compile(r'\b([Xx*]{2,}[0-9]{4})\b', re.IGNORECASE)

# Reference number
_REF_PATTERN = re.compile(
    r'(?:ref(?:erence)?\.?\s*(?:no\.?|#)?\s*|UPI\s*ref\.?\s*no\.?\s*)'
    r'([0-9]{6,20})',
    re.IGNORECASE
)

# Available balance
_BAL_PATTERN = re.compile(
    r'(?:Avl\.?\s*Bal\.?|Available\s*Bal(?:ance)?|Bal(?:ance)?)[\s:]*'
    r'(?:Rs\.?|INR|₹)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)',
    re.IGNORECASE
)

# UPI VPA / merchant
_UPI_PATTERN = re.compile(
    r'(?:'
    r'UPI/|'                                         # UPI/<VPA>
    r'UPI\s+(?:ref\s+to\s+)?(?=\S)|'               # UPI ref to <VPA> or UPI <VPA>
    r'to\s+UPI[:/]?\s*|'                            # to UPI: <VPA>
    r'(?:via\s+)?UPI\s+to\s+'                       # via UPI to <VPA>  ← new
    r')'
    r'([A-Za-z0-9._@-]{3,50})',
    re.IGNORECASE
)

# Merchant from "to/from MERCHANTNAME"
_MERCHANT_TO = re.compile(
    r'\bto\s+([A-Z][A-Za-z0-9 &.,\'-]{2,40})(?:\s+on|\s+via|\s+using|\.|\,|$)',
    re.IGNORECASE
)
_MERCHANT_FROM = re.compile(
    r'\bfrom\s+([A-Z][A-Za-z0-9 &.,\'-]{2,40})(?:\s+on|\s+via|\.|\,|$)',
    re.IGNORECASE
)

# Bank sender IDs (HDFC, SBI, etc.)
_BANK_IDS = {
    "hdfcbk": "HDFC Bank",
    "hdfcbank": "HDFC Bank",
    "sbmssg": "State Bank of India",
    "sbiinb": "State Bank of India",
    "sbi": "State Bank of India",
    "icicibank": "ICICI Bank",
    "icicib": "ICICI Bank",
    "axisbk": "Axis Bank",
    "axisbank": "Axis Bank",
    "kotakbank": "Kotak Mahindra Bank",
    "kotakbk": "Kotak Mahindra Bank",
    "pnb": "Punjab National Bank",
    "boiind": "Bank of India",
    "unionbank": "Union Bank of India",
    "canara": "Canara Bank",
    "canarabk": "Canara Bank",
    "idfcbank": "IDFC First Bank",
    "yesbnk": "Yes Bank",
    "yesbank": "Yes Bank",
    "indusind": "IndusInd Bank",
    "rbl": "RBL Bank",
    "paytmbank": "Paytm Payments Bank",
    "airtelbank": "Airtel Payments Bank",
}

# Keywords for dirty/non-essential spend detection
_DIRTY_KEYWORDS = {
    'swiggy', 'zomato', 'dominos', 'pizza', 'burger', 'kfc', 'mcdonald',
    'netflix', 'amazon prime', 'hotstar', 'disney', 'spotify', 'wynk',
    'gaming', 'steam', 'pubg', 'freefire', 'bwin', 'casino',
    'myntra', 'nykaa', 'ajio', 'meesho', 'flipkart', 'amazon',
    'uber eats', 'grofers', 'blinkit', 'instamart', 'dunzo',
    'bar', 'pub', 'liquor', 'beer', 'wine'
}

# Keywords for essential/necessity spend detection
_ESSENTIAL_KEYWORDS = {
    'hospital', 'pharmacy', 'medical', 'clinic', 'doctor',
    'school', 'college', 'university', 'institute', 'tuition',
    'electricity', 'eb', 'bescom', 'tneb', 'msedcl', 'water', 'gas',
    'rent', 'maintenance', 'society',
    'insurance', 'lic', 'health insurance',
    'petrol', 'fuel', 'diesel', 'metro', 'bus', 'train', 'railway',
    'jio', 'airtel', 'vi', 'bsnl', 'recharge',
    'exam', 'fee', 'challan'
}


def _clean_amount(raw: str) -> float:
    """Convert raw amount string like '2,000.50' to float."""
    return float(raw.replace(',', ''))


def _detect_bank(sender_id: str) -> str:
    if not sender_id:
        return "Unknown Bank"
    sid = sender_id.lower().strip()
    for key, name in _BANK_IDS.items():
        if key in sid:
            return name
    # Fuzzy: last 6 chars of alphanumeric sender
    return sender_id.upper()


def _detect_transaction_mode(sms: str) -> str:
    text = sms.lower()
    if 'upi' in text:
        return 'UPI'
    if 'neft' in text:
        return 'NEFT'
    if 'imps' in text:
        return 'IMPS'
    if 'rtgs' in text:
        return 'RTGS'
    if 'atm' in text or 'cash withdrawal' in text:
        return 'ATM'
    if any(w in text for w in ['debit card', 'credit card', 'card ending', 'card no']):
        return 'CARD'
    if 'emi' in text:
        return 'EMI'
    if 'nach' in text:
        return 'NACH'
    return 'BANK_TRANSFER'


def _extract_merchant(sms: str, mode: str) -> Optional[str]:
    """Try to extract merchant/recipient name from SMS."""
    # UPI VPA
    upi_match = _UPI_PATTERN.search(sms)
    if upi_match:
        vpa = upi_match.group(1).strip()
        # Return the full VPA (e.g. 9841234567@ybl) so our unclear-detection catches it
        if '@' in vpa:
            name = vpa.split('@')[0]
            name_clean = re.sub(r'\d', '', name).strip('-').strip('.')
            if len(name_clean) > 2:
                return name_clean.upper()  # real merchant name like ZOMATO
            return vpa  # keep full VPA (phone number VPA) so regex flags it
        return vpa.upper()

    # "to MERCHANT" pattern
    to_match = _MERCHANT_TO.search(sms)
    if to_match:
        m = to_match.group(1).strip()
        if len(m) > 2 and not re.match(r'^[0-9/\-]+$', m):
            return m.upper()

    # "from MERCHANT" pattern (for credits)
    from_match = _MERCHANT_FROM.search(sms)
    if from_match:
        m = from_match.group(1).strip()
        if len(m) > 2 and not re.match(r'^[0-9/\-]+$', m):
            return m.upper()

    return None


def _hint_category(merchant: str, sms: str) -> tuple[str, bool]:
    """
    Returns (category_hint, is_potentially_dirty).
    Uses merchant name and SMS keywords.
    """
    text = (merchant or '' + ' ' + sms).lower()

    for kw in _DIRTY_KEYWORDS:
        if kw in text:
            return 'entertainment/food', True

    for kw in _ESSENTIAL_KEYWORDS:
        if kw in text:
            return 'essential', False

    # Amount-based hints
    return 'other', False


def parse_sms(sms_body: str, sender_id: str = '') -> ParsedSMS:
    """
    Parse a bank SMS message and return structured data.

    Args:
        sms_body: The raw SMS body text
        sender_id: The sender ID (e.g., 'HDFCBK', 'SBIINB')

    Returns:
        ParsedSMS object with extracted transaction data
    """
    result = ParsedSMS(raw_sms=sms_body, sender_id=sender_id)
    result.bank_name = _detect_bank(sender_id)

    sms_lower = sms_body.lower()

    # ── Detect transaction type ──
    is_debit = any(w in sms_lower for w in [
        'debited', 'debit', 'withdrawn', 'withdrawal', 'paid', 'payment',
        'purchase', 'spent', 'sent', 'transferred to', 'charged'
    ])
    is_credit = any(w in sms_lower for w in [
        'credited', 'credit', 'received', 'deposited', 'added',
        'transferred to your', 'received from'
    ])

    # Resolve conflicts: "debited...and credited to a/c" is a DEBIT (UPI send)
    # Only mark as credit if "credited to your a/c" — meaning money came TO the user
    if is_credit and is_debit:
        # "credited to your" / "credit in your" → money arrived (credit)
        # "debited" + "credited to a/c" → money sent (debit)
        credit_to_user = any(p in sms_lower for p in [
            'credited to your', 'credit to your', 'credit in your',
            'deposited to your', 'received in your', 'added to your'
        ])
        debit_from_user = 'debited' in sms_lower
        if debit_from_user and not credit_to_user:
            # "debited" is always about the user's account losing money
            is_credit = False
        elif credit_to_user and not debit_from_user:
            is_debit = False
        else:
            # Both reference user — last resort: "debited" wins (more explicit)
            is_credit = False

    if not (is_debit or is_credit):
        result.is_transaction = False
        return result

    result.is_transaction = True
    result.transaction_type = 'debit' if is_debit else 'credit'
    result.is_income = (result.transaction_type == 'credit')
    result.is_expense = (result.transaction_type == 'debit')

    # ── Extract amount ──
    amount_matches = _AMOUNT_PATTERN.findall(sms_body)
    if amount_matches:
        # Take the first (usually the transaction amount, not balance)
        result.amount = _clean_amount(amount_matches[0])

    # ── Extract account number ──
    acc_match = _ACCOUNT_PATTERN.search(sms_body)
    if not acc_match:
        acc_match = _ACCOUNT_PATTERN2.search(sms_body)
    if acc_match:
        result.account_number = acc_match.group(1).upper()

    # ── Extract transaction mode ──
    result.transaction_mode = _detect_transaction_mode(sms_body)

    # ── Extract reference number ──
    ref_match = _REF_PATTERN.search(sms_body)
    if ref_match:
        result.ref_number = ref_match.group(1)

    # ── Extract available balance ──
    bal_match = _BAL_PATTERN.search(sms_body)
    if bal_match:
        result.available_balance = _clean_amount(bal_match.group(1))

    # ── Extract merchant ──
    result.merchant = _extract_merchant(sms_body, result.transaction_mode)

    # ── Category hint ──
    if result.merchant:
        cat, possibly_dirty = _hint_category(result.merchant, sms_body)
        result.category_hint = cat

    return result


def is_bank_sms(sms_body: str, sender_id: str = '') -> bool:
    """Quick check if this looks like a bank/financial SMS."""
    financial_keywords = [
        'debited', 'credited', 'upi', 'neft', 'imps', 'rtgs', 'a/c',
        'acct', 'account', 'inr', 'rs.', '₹', 'transaction', 'balance',
        'bank', 'payment', 'transferred'
    ]
    text = sms_body.lower()
    return sum(1 for kw in financial_keywords if kw in text) >= 2
