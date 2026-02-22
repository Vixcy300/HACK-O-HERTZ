"""
Stocks routes â€“ Beyond Charts integration
Exact port of https://github.com/Vixcy300/protothon-hackathon2025
AI-Powered NSE/BSE Stock Analysis for Indian Markets
"""

import logging
import xml.etree.ElementTree as ET
import urllib.parse
from datetime import datetime
from typing import Optional

import httpx
import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/stocks", tags=["stocks"])

# â”€â”€â”€ Stock universe (matching Beyond Charts exactly) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
STOCK_LIST = {
    "Large Cap": {
        "RELIANCE.NS": "Reliance Industries",
        "TCS.NS": "Tata Consultancy Services",
        "HDFCBANK.NS": "HDFC Bank",
        "INFY.NS": "Infosys",
        "ICICIBANK.NS": "ICICI Bank",
        "HINDUNILVR.NS": "Hindustan Unilever",
        "SBIN.NS": "State Bank of India",
        "BHARTIARTL.NS": "Bharti Airtel",
        "ITC.NS": "ITC Limited",
        "KOTAKBANK.NS": "Kotak Mahindra Bank",
        "LT.NS": "Larsen & Toubro",
        "AXISBANK.NS": "Axis Bank",
        "WIPRO.NS": "Wipro",
        "ASIANPAINT.NS": "Asian Paints",
        "MARUTI.NS": "Maruti Suzuki",
        "HCLTECH.NS": "HCL Technologies",
        "SUNPHARMA.NS": "Sun Pharmaceutical",
        "BAJFINANCE.NS": "Bajaj Finance",
        "TATAMOTORS.NS": "Tata Motors",
        "TATASTEEL.NS": "Tata Steel",
        "NTPC.NS": "NTPC Limited",
        "ONGC.NS": "ONGC",
        "POWERGRID.NS": "Power Grid Corp",
        "COALINDIA.NS": "Coal India",
        "TECHM.NS": "Tech Mahindra",
        "ULTRACEMCO.NS": "UltraTech Cement",
        "TITAN.NS": "Titan Company",
        "NESTLEIND.NS": "Nestle India",
        "DRREDDY.NS": "Dr. Reddy's Labs",
        "BAJAJFINSV.NS": "Bajaj Finserv",
    },
    "Mid Cap": {
        "IDFCFIRSTB.NS": "IDFC First Bank",
        "FEDERALBNK.NS": "Federal Bank",
        "BANDHANBNK.NS": "Bandhan Bank",
        "LICHSGFIN.NS": "LIC Housing Finance",
        "MUTHOOTFIN.NS": "Muthoot Finance",
        "TATACOMM.NS": "Tata Communications",
        "TATAELXSI.NS": "Tata Elxsi",
        "PERSISTENT.NS": "Persistent Systems",
        "COFORGE.NS": "Coforge",
        "LTIM.NS": "LTIMindtree",
        "MPHASIS.NS": "Mphasis",
        "JUBLFOOD.NS": "Jubilant FoodWorks",
        "PAGEIND.NS": "Page Industries",
        "VOLTAS.NS": "Voltas",
        "ZOMATO.NS": "Zomato",
        "IRCTC.NS": "IRCTC",
        "DELHIVERY.NS": "Delhivery",
        "NYKAA.NS": "Nykaa",
        "PIIND.NS": "PI Industries",
        "HAVELLS.NS": "Havells India",
    },
    "Small Cap": {
        "YESBANK.NS": "Yes Bank",
        "IRFC.NS": "Indian Railway Finance",
        "IDEA.NS": "Vodafone Idea",
        "SUZLON.NS": "Suzlon Energy",
        "NHPC.NS": "NHPC Limited",
        "SAIL.NS": "Steel Authority India",
        "NATIONALUM.NS": "National Aluminium",
        "RVNL.NS": "Rail Vikas Nigam",
        "NBCC.NS": "NBCC India",
        "BEL.NS": "Bharat Electronics",
        "HAL.NS": "Hindustan Aeronautics",
        "SJVN.NS": "SJVN Limited",
        "IRCON.NS": "Ircon International",
        "RITES.NS": "RITES Limited",
        "PNB.NS": "Punjab National Bank",
    },
}

# Flat lookup: symbol -> {name, sector, yf_symbol}
_FLAT: dict[str, dict] = {}
for _cat, _stocks in STOCK_LIST.items():
    for _sym, _name in _stocks.items():
        _FLAT[_sym.replace(".NS", "")] = {"name": _name, "sector": _cat, "yf_symbol": _sym}

# â”€â”€â”€ Technical indicators (exact port of Beyond Charts) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    c = df["close"]

    df["SMA_20"] = c.rolling(20).mean()
    df["SMA_50"] = c.rolling(50).mean()
    df["EMA_12"] = c.ewm(span=12, adjust=False).mean()
    df["EMA_26"] = c.ewm(span=26, adjust=False).mean()
    df["MACD"] = df["EMA_12"] - df["EMA_26"]
    df["MACD_Signal"] = df["MACD"].ewm(span=9, adjust=False).mean()
    df["MACD_Histogram"] = df["MACD"] - df["MACD_Signal"]

    delta = c.diff()
    gain = delta.where(delta > 0, 0.0).rolling(14).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(14).mean()
    df["RSI"] = 100 - (100 / (1 + gain / loss.replace(0, np.nan)))

    df["BB_Mid"] = c.rolling(20).mean()
    bb_std = c.rolling(20).std()
    df["BB_Upper"] = df["BB_Mid"] + 2 * bb_std
    df["BB_Lower"] = df["BB_Mid"] - 2 * bb_std
    df["BB_Width"] = (df["BB_Upper"] - df["BB_Lower"]) / df["BB_Mid"] * 100

    low14 = df["low"].rolling(14).min()
    high14 = df["high"].rolling(14).max()
    df["Stoch_K"] = 100 * (c - low14) / (high14 - low14).replace(0, np.nan)
    df["Stoch_D"] = df["Stoch_K"].rolling(3).mean()

    hl = df["high"] - df["low"]
    hc = (df["high"] - c.shift()).abs()
    lc = (df["low"] - c.shift()).abs()
    df["ATR"] = pd.concat([hl, hc, lc], axis=1).max(axis=1).rolling(14).mean()

    df["Volume_SMA"] = df["volume"].rolling(20).mean()
    df["Volume_Ratio"] = df["volume"] / df["Volume_SMA"].replace(0, np.nan)
    df["Daily_Return"] = c.pct_change() * 100
    df["Support"] = df["low"].rolling(20).min()
    df["Resistance"] = df["high"].rolling(20).max()

    return df


def _generate_signal(df: pd.DataFrame) -> dict | None:
    """Exact port of Beyond Charts generate_prediction()."""
    if df is None or len(df) < 50:
        return None

    latest = df.iloc[-1]
    prev = df.iloc[-2]

    signals: list[dict] = []
    bullish_count = 0
    bearish_count = 0

    rsi = float(latest["RSI"]) if pd.notna(latest["RSI"]) else 50.0

    if rsi < 30:
        signals.append({"name": "RSI Oversold", "direction": "BULLISH",
                         "reason": f"RSI at {rsi:.1f} - Stock is oversold, potential bounce expected"})
        bullish_count += 2
    elif rsi > 70:
        signals.append({"name": "RSI Overbought", "direction": "BEARISH",
                         "reason": f"RSI at {rsi:.1f} - Stock is overbought, potential pullback expected"})
        bearish_count += 2
    elif rsi > 50:
        signals.append({"name": "RSI Momentum", "direction": "BULLISH",
                         "reason": f"RSI at {rsi:.1f} - Positive momentum in the stock"})
        bullish_count += 1
    else:
        signals.append({"name": "RSI Momentum", "direction": "BEARISH",
                         "reason": f"RSI at {rsi:.1f} - Weak momentum in the stock"})
        bearish_count += 1

    if latest["MACD"] > latest["MACD_Signal"]:
        if prev["MACD"] <= prev["MACD_Signal"]:
            signals.append({"name": "MACD Crossover", "direction": "BULLISH",
                             "reason": "MACD crossed above signal line - Strong buy signal"})
            bullish_count += 3
        else:
            signals.append({"name": "MACD Trend", "direction": "BULLISH",
                             "reason": "MACD above signal line - Uptrend continuing"})
            bullish_count += 1
    else:
        if prev["MACD"] >= prev["MACD_Signal"]:
            signals.append({"name": "MACD Crossover", "direction": "BEARISH",
                             "reason": "MACD crossed below signal line - Sell signal"})
            bearish_count += 3
        else:
            signals.append({"name": "MACD Trend", "direction": "BEARISH",
                             "reason": "MACD below signal line - Downtrend continuing"})
            bearish_count += 1

    price = float(latest["close"])
    sma20 = float(latest["SMA_20"]) if pd.notna(latest["SMA_20"]) else price
    sma50 = float(latest["SMA_50"]) if pd.notna(latest["SMA_50"]) else price
    if price > sma20 > sma50:
        signals.append({"name": "Moving Averages", "direction": "BULLISH",
                         "reason": "Price above both SMAs with bullish alignment - Strong uptrend"})
        bullish_count += 2
    elif price < sma20 < sma50:
        signals.append({"name": "Moving Averages", "direction": "BEARISH",
                         "reason": "Price below both SMAs with bearish alignment - Strong downtrend"})
        bearish_count += 2
    else:
        signals.append({"name": "Moving Averages", "direction": "NEUTRAL",
                         "reason": "Mixed moving average signals - No clear trend"})

    if pd.notna(latest["BB_Lower"]) and price < float(latest["BB_Lower"]):
        signals.append({"name": "Bollinger Bands", "direction": "BULLISH",
                         "reason": "Price below lower band - Oversold, potential reversal up"})
        bullish_count += 2
    elif pd.notna(latest["BB_Upper"]) and price > float(latest["BB_Upper"]):
        signals.append({"name": "Bollinger Bands", "direction": "BEARISH",
                         "reason": "Price above upper band - Overbought, potential reversal down"})
        bearish_count += 2
    else:
        signals.append({"name": "Bollinger Bands", "direction": "NEUTRAL",
                         "reason": "Price within normal Bollinger Band range"})

    if pd.notna(latest["Stoch_K"]) and pd.notna(latest["Stoch_D"]):
        sk, sd = float(latest["Stoch_K"]), float(latest["Stoch_D"])
        if sk < 20 and sk > sd:
            signals.append({"name": "Stochastic", "direction": "BULLISH",
                             "reason": "Oversold with bullish crossover - Good buying opportunity"})
            bullish_count += 2
        elif sk > 80 and sk < sd:
            signals.append({"name": "Stochastic", "direction": "BEARISH",
                             "reason": "Overbought with bearish crossover - Consider selling"})
            bearish_count += 2

    vol_ratio = float(latest["Volume_Ratio"]) if pd.notna(latest["Volume_Ratio"]) else 1.0
    daily_ret = float(latest["Daily_Return"]) if pd.notna(latest["Daily_Return"]) else 0.0
    if vol_ratio > 1.5 and daily_ret > 0:
        signals.append({"name": "Volume", "direction": "BULLISH",
                         "reason": "High volume on up day - Strong buying interest"})
        bullish_count += 2
    elif vol_ratio > 1.5 and daily_ret < 0:
        signals.append({"name": "Volume", "direction": "BEARISH",
                         "reason": "High volume on down day - Strong selling pressure"})
        bearish_count += 2

    if bullish_count > bearish_count + 2:
        direction = "BULLISH"
        confidence = min(85, 50 + (bullish_count - bearish_count) * 5)
    elif bearish_count > bullish_count + 2:
        direction = "BEARISH"
        confidence = min(85, 50 + (bearish_count - bullish_count) * 5)
    else:
        direction = "NEUTRAL"
        confidence = 50

    if direction == "BULLISH":
        recommendation = ("Strong Buy - Multiple indicators aligned bullishly"
                           if confidence >= 70 else "Buy - Positive signals but monitor closely")
    elif direction == "BEARISH":
        recommendation = ("Strong Sell - Multiple bearish indicators"
                           if confidence >= 70 else "Sell/Hold - Caution advised, negative bias")
    else:
        recommendation = "Hold - Mixed signals, wait for clarity"

    def _s(v):
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return None
        return round(float(v), 4)

    return {
        "direction": direction,
        "confidence": confidence,
        "bullish_signals": bullish_count,
        "bearish_signals": bearish_count,
        "signals": signals,
        "recommendation": recommendation,
        "current_price": _s(price),
        "rsi": _s(rsi),
        "macd": _s(latest["MACD"]),
        "macd_signal": _s(latest["MACD_Signal"]),
        "sma20": _s(sma20),
        "sma50": _s(sma50),
        "bb_upper": _s(latest["BB_Upper"]),
        "bb_mid": _s(latest["BB_Mid"]),
        "bb_lower": _s(latest["BB_Lower"]),
        "bb_width": _s(latest["BB_Width"]),
        "stoch_k": _s(latest["Stoch_K"]),
        "stoch_d": _s(latest["Stoch_D"]),
        "atr": _s(latest["ATR"]),
        "volume_ratio": _s(vol_ratio),
        "support": _s(latest["Support"]),
        "resistance": _s(latest["Resistance"]),
        "disclaimer": "Educational purpose only. Not financial advice. Consult a qualified advisor.",
    }


# â”€â”€â”€ News helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
_POSITIVE_WORDS = ["surge", "gain", "rise", "jump", "bull", "growth", "profit",
                   "upgrade", "buy", "rally", "boom", "soar", "record", "strong",
                   "positive", "outperform", "beat", "higher", "recovery"]
_NEGATIVE_WORDS = ["fall", "drop", "loss", "decline", "bear", "crash", "sell",
                   "downgrade", "slump", "tumble", "plunge", "weak", "negative",
                   "concern", "lower", "cut", "slash", "warning"]
_MARKET_TERMS = ["sensex", "nifty", "market today", "stock market", "fii", "dii",
                 "market rally", "market crash"]

_RSS_FEEDS = [
    ("Economic Times", "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms"),
    ("ET Stocks", "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms"),
    ("Moneycontrol", "https://www.moneycontrol.com/rss/latestnews.xml"),
    ("Business Standard", "https://www.business-standard.com/rss/markets-106.rss"),
    ("Financial Express", "https://www.financialexpress.com/market/feed/"),
    ("LiveMint", "https://www.livemint.com/rss/markets"),
]

_STOCK_KEYWORDS: dict[str, list[str]] = {
    "reliance": ["reliance industries", "reliance", "ril ", "mukesh ambani", "jio"],
    "tcs": ["tata consultancy", "tcs "],
    "hdfcbank": ["hdfc bank"],
    "infy": ["infosys", "infy"],
    "icicibank": ["icici bank"],
    "hindunilvr": ["hindustan unilever", "hul "],
    "sbin": ["state bank of india", "sbi "],
    "bhartiartl": ["bharti airtel", "airtel"],
    "itc": ["itc limited", "itc "],
    "kotakbank": ["kotak mahindra", "kotak bank"],
    "lt": ["larsen & toubro", "l&t"],
    "axisbank": ["axis bank"],
    "maruti": ["maruti suzuki"],
    "asianpaint": ["asian paints"],
    "wipro": ["wipro"],
    "hcltech": ["hcl tech", "hcl technologies"],
    "sunpharma": ["sun pharma", "sun pharmaceutical"],
    "bajfinance": ["bajaj finance"],
    "tatamotors": ["tata motors"],
    "tatasteel": ["tata steel"],
    "ntpc": ["ntpc"],
    "ongc": ["ongc"],
    "powergrid": ["power grid"],
    "coalindia": ["coal india"],
    "techm": ["tech mahindra"],
    "ultracemco": ["ultratech cement"],
    "titan": ["titan company"],
    "bajajfinsv": ["bajaj finserv"],
    "nestleind": ["nestle india"],
    "drreddy": ["dr reddy"],
    "zomato": ["zomato"],
    "irctc": ["irctc"],
    "yesbank": ["yes bank"],
    "suzlon": ["suzlon energy"],
    "idea": ["vodafone idea"],
    "sail": ["steel authority", "sail "],
    "bel": ["bharat electronics"],
    "hal": ["hindustan aeronautics"],
    "pnb": ["punjab national bank", "pnb "],
}


def _sentiment(text: str) -> tuple[str, float]:
    pos = sum(1 for w in _POSITIVE_WORDS if w in text)
    neg = sum(1 for w in _NEGATIVE_WORDS if w in text)
    if pos > neg:
        return "positive", min(0.9, 0.5 + (pos - neg) * 0.15)
    if neg > pos:
        return "negative", max(-0.9, -0.5 - (neg - pos) * 0.15)
    return "neutral", 0.0


async def _fetch_news_rss(symbol: str) -> list[dict]:
    stock_name = symbol.lower().replace(".ns", "").replace(".bo", "")
    keywords = _STOCK_KEYWORDS.get(stock_name, [stock_name, f" {stock_name} "])

    stock_specific: list[dict] = []
    general_market: list[dict] = []
    seen: set[str] = set()

    async with httpx.AsyncClient(timeout=6.0) as client:
        for source_name, url in _RSS_FEEDS:
            try:
                resp = await client.get(url, follow_redirects=True)
                root = ET.fromstring(resp.text)
            except Exception:
                continue

            for item in root.findall(".//item")[:20]:
                title = (item.findtext("title") or "").strip()
                desc_raw = (item.findtext("description") or "").strip()
                link = (item.findtext("link") or "").strip()
                pub = (item.findtext("pubDate") or "").strip()

                if not title:
                    continue

                # Basic HTML strip via re (no bs4 needed)
                import re
                desc_clean = re.sub(r"<[^>]+>", "", desc_raw)[:200]

                combined = (title + " " + desc_clean).lower()
                title_key = title[:50].lower()
                if title_key in seen:
                    continue

                is_specific = any(kw in combined for kw in keywords if len(kw) > 3)
                is_market = not is_specific and any(t in combined for t in _MARKET_TERMS)

                if not (is_specific or is_market):
                    continue

                sentiment, score = _sentiment(combined)
                if sentiment == "positive":
                    reason = "Positive market sentiment typically supports price appreciation."
                elif sentiment == "negative":
                    reason = "Negative news can create selling pressure. Watch support levels."
                else:
                    reason = "Neutral sentiment â€“ market awaiting further catalysts."

                item_data = {
                    "source": source_name,
                    "title": title,
                    "summary": desc_clean,
                    "link": link,
                    "published": pub,
                    "sentiment": sentiment,
                    "sentiment_score": round(score, 2),
                    "is_stock_specific": is_specific,
                    "impact": "HIGH" if is_specific else "MEDIUM",
                    "reason": reason,
                }
                seen.add(title_key)

                if is_specific:
                    stock_specific.append(item_data)
                else:
                    general_market.append(item_data)

                if len(stock_specific) >= 8 and len(general_market) >= 4:
                    break

    # Google News fallback
    if len(stock_specific) < 3:
        try:
            kw = keywords[0] if keywords else stock_name
            gurl = (
                f"https://news.google.com/rss/search?q="
                f"{urllib.parse.quote(kw + ' stock NSE BSE')}&hl=en-IN&gl=IN&ceid=IN:en"
            )
            async with httpx.AsyncClient(timeout=6.0) as c:
                resp = await c.get(gurl, follow_redirects=True)
                root = ET.fromstring(resp.text)
            for item in root.findall(".//item")[:8]:
                title = (item.findtext("title") or "").strip()
                link = (item.findtext("link") or "").strip()
                pub = (item.findtext("pubDate") or "").strip()
                if not title or title[:50].lower() in seen:
                    continue
                sentiment, score = _sentiment(title.lower())
                reason = ("Positive market sentiment." if sentiment == "positive"
                           else "Negative news can create selling pressure." if sentiment == "negative"
                           else "Neutral â€“ market awaiting catalysts.")
                stock_specific.append({
                    "source": "Google News", "title": title, "summary": "",
                    "link": link, "published": pub, "sentiment": sentiment,
                    "sentiment_score": round(score, 2), "is_stock_specific": True,
                    "impact": "HIGH", "reason": reason,
                })
                seen.add(title[:50].lower())
        except Exception:
            pass

    return stock_specific[:10] + general_market[:5]


# â”€â”€â”€ Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/symbols")
async def list_symbols():
    """All stocks grouped by Large/Mid/Small Cap + flat list."""
    grouped: dict[str, list] = {}
    for cat, stocks in STOCK_LIST.items():
        grouped[cat] = [
            {"symbol": sym.replace(".NS", ""), "name": name, "sector": cat, "yf_symbol": sym}
            for sym, name in stocks.items()
        ]
    flat = [item for items in grouped.values() for item in items]
    return {"symbols": flat, "grouped": grouped, "categories": list(STOCK_LIST.keys())}


@router.get("/quote")
async def get_quote(symbol: str = Query("RELIANCE")):
    """Real-time price quote."""
    info_meta = _FLAT.get(symbol.upper())
    yf_sym = info_meta["yf_symbol"] if info_meta else f"{symbol}.NS"
    try:
        ticker = yf.Ticker(yf_sym)
        hist = ticker.history(period="5d", auto_adjust=True)
        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No data for {symbol}")

        hist.columns = [c.lower() for c in hist.columns]
        current = float(hist["close"].iloc[-1])
        prev = float(hist["close"].iloc[-2]) if len(hist) >= 2 else current
        change = current - prev
        change_pct = (change / prev) * 100 if prev else 0.0

        try:
            fi = ticker.fast_info
            mktcap = getattr(fi, "market_cap", 0) or 0
            week52h = getattr(fi, "year_high", None)
            week52l = getattr(fi, "year_low", None)
        except Exception:
            mktcap = 0; week52h = None; week52l = None

        try:
            pe = ticker.info.get("trailingPE")
        except Exception:
            pe = None

        return {
            "symbol": symbol.upper(),
            "name": info_meta["name"] if info_meta else symbol.upper(),
            "sector": info_meta["sector"] if info_meta else "Unknown",
            "price": round(current, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "volume": int(hist["volume"].iloc[-1]),
            "day_high": round(float(hist["high"].iloc[-1]), 2),
            "day_low": round(float(hist["low"].iloc[-1]), 2),
            "week_52_high": round(float(week52h), 2) if week52h else None,
            "week_52_low": round(float(week52l), 2) if week52l else None,
            "market_cap": int(mktcap),
            "pe_ratio": round(float(pe), 2) if pe else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chart")
async def get_chart(
    symbol: str = Query("RELIANCE"),
    period: str = Query("1y"),
    interval: str = Query("1d"),
):
    """Full OHLCV + all technical indicators per candle."""
    info_meta = _FLAT.get(symbol.upper())
    yf_sym = info_meta["yf_symbol"] if info_meta else f"{symbol}.NS"

    try:
        ticker = yf.Ticker(yf_sym)
        hist = ticker.history(period=period, interval=interval, auto_adjust=True)
        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No data for {symbol}")

        hist = hist.reset_index()
        hist.columns = [str(c).lower() for c in hist.columns]
        date_col = "date" if "date" in hist.columns else "datetime"
        hist["date"] = pd.to_datetime(hist[date_col])
        hist = hist.set_index("date")

        df = _compute_indicators(hist)

        def _v(x):
            if x is None or (isinstance(x, float) and np.isnan(x)):
                return None
            return round(float(x), 4)

        candles = []
        for dt, row in df.iterrows():
            candles.append({
                "date": dt.strftime("%Y-%m-%d"),
                "open": _v(row["open"]),
                "high": _v(row["high"]),
                "low": _v(row["low"]),
                "close": _v(row["close"]),
                "volume": int(row["volume"]) if pd.notna(row["volume"]) else 0,
                "sma20": _v(row["SMA_20"]),
                "sma50": _v(row["SMA_50"]),
                "rsi": _v(row["RSI"]),
                "macd": _v(row["MACD"]),
                "macd_signal": _v(row["MACD_Signal"]),
                "macd_hist": _v(row["MACD_Histogram"]),
                "bb_upper": _v(row["BB_Upper"]),
                "bb_mid": _v(row["BB_Mid"]),
                "bb_lower": _v(row["BB_Lower"]),
                "bb_width": _v(row["BB_Width"]),
                "stoch_k": _v(row["Stoch_K"]),
                "stoch_d": _v(row["Stoch_D"]),
                "atr": _v(row["ATR"]),
                "volume_ratio": _v(row["Volume_Ratio"]),
                "support": _v(row["Support"]),
                "resistance": _v(row["Resistance"]),
            })

        return {"symbol": symbol.upper(), "period": period, "candles": candles}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/signal")
async def get_signal(symbol: str = Query("RELIANCE")):
    """Beyond Charts prediction engine: BULLISH / BEARISH / NEUTRAL with full signal breakdown."""
    info_meta = _FLAT.get(symbol.upper())
    yf_sym = info_meta["yf_symbol"] if info_meta else f"{symbol}.NS"

    try:
        ticker = yf.Ticker(yf_sym)
        hist = ticker.history(period="1y", auto_adjust=True)
        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No data for {symbol}")
        hist.columns = [c.lower() for c in hist.columns]
        df = _compute_indicators(hist)
        result = _generate_signal(df)
        if result is None:
            raise HTTPException(status_code=422, detail="Insufficient data for signal")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/news")
async def get_news(symbol: str = Query("RELIANCE")):
    """Live RSS news with sentiment analysis (positive/negative/neutral)."""
    articles = await _fetch_news_rss(symbol.upper())
    stock_specific_count = sum(1 for a in articles if a.get("is_stock_specific"))
    return {
        "symbol": symbol.upper(),
        "articles": articles,
        "stock_specific_count": stock_specific_count,
        "total": len(articles),
    }


@router.get("/index")
async def get_market_index():
    """Nifty 50 and Sensex snapshot."""
    result = {}
    for key, yf_sym in [("nifty50", "^NSEI"), ("sensex", "^BSESN")]:
        try:
            t = yf.Ticker(yf_sym)
            hist = t.history(period="5d", auto_adjust=True)
            if hist.empty:
                continue
            hist.columns = [c.lower() for c in hist.columns]
            price = float(hist["close"].iloc[-1])
            prev = float(hist["close"].iloc[-2]) if len(hist) >= 2 else price
            change = price - prev
            result[key] = {
                "price": round(price, 2),
                "change": round(change, 2),
                "change_pct": round((change / prev) * 100, 2) if prev else 0.0,
            }
        except Exception:
            pass
    return result

