/**
 * StocksPage – Beyond Charts exact clone
 * Exact port of https://github.com/Vixcy300/protothon-hackathon2025
 * Tabs: Overview | Charts | Prediction | News Analysis | Indicators
 */

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Minus, Search, RefreshCw,
  Newspaper, BarChart2, Activity, ChevronDown, ExternalLink,
  AlertTriangle, Zap, Target,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { stocksApi } from '@/lib/api'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

// ── Types ────────────────────────────────────────────────────────────────────
interface StockSymbol { symbol: string; name: string; sector: string; yf_symbol?: string }
interface Quote {
  symbol: string; name: string; price: number; change: number
  change_pct: number; volume: number; market_cap: number; pe_ratio: number | null
  week_52_high: number | null; week_52_low: number | null
  day_high: number; day_low: number; sector: string
}
interface SignalItem { name: string; direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; reason: string }
interface Signal {
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; confidence: number
  bullish_signals: number; bearish_signals: number
  signals: SignalItem[]; recommendation: string; disclaimer: string
  current_price: number
  rsi: number; macd: number; macd_signal: number
  sma20: number; sma50: number
  bb_upper: number; bb_mid: number; bb_lower: number; bb_width: number
  stoch_k: number; stoch_d: number; atr: number; volume_ratio: number
  support: number; resistance: number
}
interface Candle {
  date: string; open: number; high: number; low: number; close: number
  volume: number; sma20: number | null; sma50: number | null
  rsi: number | null; macd: number | null; macd_signal: number | null; macd_hist: number | null
  bb_upper: number | null; bb_mid: number | null; bb_lower: number | null
  stoch_k: number | null; stoch_d: number | null
  atr: number | null; volume_ratio: number | null
}
interface NewsArticle {
  source: string; title: string; summary: string; link: string; published: string
  sentiment: 'positive' | 'negative' | 'neutral'
  sentiment_score: number; is_stock_specific: boolean
  impact: 'HIGH' | 'MEDIUM'; reason: string
}

const PERIODS = [
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
  { label: '2Y', value: '2y' },
]

const TABS = ['Overview', 'Charts', 'Prediction', 'Indicators', 'News'] as const
type Tab = typeof TABS[number]

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, dec = 2) {
  if (n == null) return '—'
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
function fmtK(n: number) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`
  return `₹${n.toLocaleString('en-IN')}`
}
function fmtDate(iso: string, short = false) {
  try {
    const d = parseISO(iso)
    return short ? format(d, 'dd MMM') : format(d, 'dd MMM yy')
  } catch {
    return iso.slice(0, 10)
  }
}

// ── Confidence Gauge (SVG half-circle) ───────────────────────────────────────
function ConfidenceGauge({ value, direction }: { value: number; direction: string }) {
  const color = direction === 'BULLISH' ? '#10b981' : direction === 'BEARISH' ? '#ef4444' : '#f59e0b'
  const pct = Math.min(100, Math.max(0, value))
  // arc: 0%=left end, 100%=right end, semicircle circumference ≈ 163
  const arcLen = (pct / 100) * 163
  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="78" viewBox="0 0 140 78">
        <path d="M14 70 A56 56 0 0 1 126 70" fill="none" className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="12" strokeLinecap="round" />
        <path d="M14 70 A56 56 0 0 1 126 70" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${arcLen} 163`} style={{ transition: 'stroke-dasharray .6s ease' }} />
        <text x="70" y="58" textAnchor="middle" fill={color} fontSize="20" fontWeight="bold">{value}%</text>
      </svg>
      <div className="flex justify-between w-full px-3 -mt-1 text-[10px] text-gray-500">
        <span>0</span><span>50</span><span>100</span>
      </div>
    </div>
  )
}

// ── Signal badge ─────────────────────────────────────────────────────────────
function SignalBadge({ direction, confidence }: { direction: string; confidence: number }) {
  if (direction === 'BULLISH') return (
    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/40 rounded-2xl">
      <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
      <span className="text-emerald-700 dark:text-emerald-400 font-bold text-lg">{direction}</span>
      <span className="text-emerald-600 dark:text-emerald-300 text-sm ml-1">{confidence}% confidence</span>
    </div>
  )
  if (direction === 'BEARISH') return (
    <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-500/20 border border-red-300 dark:border-red-500/40 rounded-2xl">
      <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
      <span className="text-red-700 dark:text-red-400 font-bold text-lg">{direction}</span>
      <span className="text-red-600 dark:text-red-300 text-sm ml-1">{confidence}% confidence</span>
    </div>
  )
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 dark:bg-yellow-500/20 border border-yellow-300 dark:border-yellow-500/40 rounded-2xl">
      <Minus className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
      <span className="text-yellow-700 dark:text-yellow-400 font-bold text-lg">{direction}</span>
      <span className="text-yellow-600 dark:text-yellow-300 text-sm ml-1">{confidence}% confidence</span>
    </div>
  )
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-xs shadow-2xl">
      <p className="text-gray-500 dark:text-gray-400 mb-2 font-medium">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-600 dark:text-gray-300">{p.name}:</span>
          <span className="font-semibold text-gray-900 dark:text-white">
            {typeof p.value === 'number' ? fmt(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── RSI gauge ────────────────────────────────────────────────────────────────
function RSIGauge({ value }: { value: number }) {
  const pct = Math.min(Math.max(value, 0), 100)
  const color = pct < 35 ? '#10b981' : pct > 65 ? '#ef4444' : '#f59e0b'
  const label = pct < 35 ? 'Oversold' : pct > 65 ? 'Overbought' : 'Neutral'
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-14 overflow-hidden">
        <div className="absolute inset-0 rounded-t-full border-[10px] border-gray-200 dark:border-gray-700 border-b-0" />
        <div
          className="absolute inset-0 rounded-t-full border-[10px] border-b-0 origin-bottom transition-all duration-700"
          style={{
            borderColor: color,
            transform: `rotate(${(pct / 100) * 180 - 180}deg)`,
            clipPath: 'inset(0 0 0 0)',
          }}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
          <p className="text-2xl font-bold" style={{ color }}>{Math.round(value)}</p>
        </div>
      </div>
      <p className="text-xs mt-1" style={{ color }}>{label}</p>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function StocksPage() {
  const [allSymbols, setAllSymbols] = useState<StockSymbol[]>([])
  const [grouped, setGrouped] = useState<Record<string, StockSymbol[]>>({})
  const [categories, setCategories] = useState<string[]>(['Large Cap', 'Mid Cap', 'Small Cap'])
  const [selectedCategory, setSelectedCategory] = useState('Large Cap')
  const [selectedSymbol, setSelectedSymbol] = useState('RELIANCE')
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [period, setPeriod] = useState('3mo')
  const [activeTab, setActiveTab] = useState<Tab>('Overview')

  const [quote, setQuote] = useState<Quote | null>(null)
  const [signal, setSignal] = useState<Signal | null>(null)
  const [candles, setCandles] = useState<Candle[]>([])
  const [news, setNews] = useState<NewsArticle[]>([])
  const [marketIndex, setMarketIndex] = useState<Record<string, { price: number; change: number; change_pct: number }> | null>(null)

  const [loadingQuote, setLoadingQuote] = useState(false)
  const [loadingChart, setLoadingChart] = useState(false)
  const [loadingSignal, setLoadingSignal] = useState(false)
  const [loadingNews, setLoadingNews] = useState(false)

  // Load symbols
  useEffect(() => {
    stocksApi.symbols().then((d) => {
      setAllSymbols(d.symbols)
      setGrouped(d.grouped ?? {})
      if (d.categories?.length) setCategories(d.categories)
    }).catch(() => {})
    stocksApi.index().then(d => setMarketIndex(d)).catch(() => {})
  }, [])

  const loadStock = useCallback(async (sym: string, p = period) => {
    setLoadingQuote(true)
    setLoadingSignal(true)
    setLoadingChart(true)

    try {
      const [q, s, c] = await Promise.all([
        stocksApi.quote(sym),
        stocksApi.signal(sym),
        stocksApi.chart(sym, p),
      ])
      setQuote(q)
      setSignal(s)
      setCandles(c.candles || [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'check server'
      toast.error(`Failed to load ${sym}: ${msg}`)
    } finally {
      setLoadingQuote(false)
      setLoadingSignal(false)
      setLoadingChart(false)
    }
  }, [period])

  const loadNews = useCallback(async (sym: string) => {
    setLoadingNews(true)
    try {
      const n = await stocksApi.news(sym)
      setNews(n.articles || [])
    } catch {
      toast.error('News fetch failed')
    } finally {
      setLoadingNews(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    loadStock(selectedSymbol, period)
  }, [selectedSymbol, period, loadStock])

  useEffect(() => {
    if (activeTab === 'News') loadNews(selectedSymbol)
  }, [activeTab, selectedSymbol, loadNews])

  const handleSelectSymbol = (sym: string) => {
    setSelectedSymbol(sym)
    setShowDropdown(false)
    setSearchQuery('')
  }

  // Stocks to show in dropdown: if searching use all, else use selected category
  const browseList = searchQuery
    ? allSymbols.filter(s =>
        s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : (grouped[selectedCategory] ?? [])

  const filtered = browseList

  // Chart data formatted for recharts
  const chartData = candles.map(c => ({
    ...c,
    date: fmtDate(c.date, true),
    fullDate: c.date,
  }))

  const isLoading = loadingQuote || loadingChart || loadingSignal

  return (
    <div className="space-y-5 max-w-6xl mx-auto px-4 pb-8" onClick={() => setShowDropdown(false)}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-violet-500" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Stocks</h1>
            <span className="text-xs px-2 py-0.5 bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 rounded-full font-medium">
              Beyond Charts
            </span>
          </div>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            AI-powered NSE/BSE analysis · See Beyond the Numbers 🐂
          </p>
        </div>

        {/* Market Indices */}
        {marketIndex && (
          <div className="flex gap-3">
            {[
              { key: 'nifty50', label: 'Nifty 50' },
              { key: 'sensex', label: 'Sensex' },
            ].map(({ key, label }) => {
              const idx = marketIndex[key]
              if (!idx) return null
              return (
                <div key={key} className="bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-xl px-3 py-2 text-center min-w-[90px]">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{fmt(idx.price, 0)}</p>
                  <p className={cn('text-xs font-medium', idx.change >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                    {idx.change >= 0 ? '▲' : '▼'} {Math.abs(idx.change_pct).toFixed(2)}%
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </motion.div>

      {/* Stock Picker Row */}
      <div className="flex flex-wrap items-center gap-3" onClick={e => e.stopPropagation()}>
        {/* Category tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-[#1a1d27] rounded-xl p-1 border border-gray-200 dark:border-[#2a2d3a]">
          {categories.map(cat => (
            <button key={cat} onClick={() => { setSelectedCategory(cat); setShowDropdown(false) }}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
                selectedCategory === cat ? 'bg-violet-600 text-white shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              )}>
              {cat}
            </button>
          ))}
        </div>

        {/* Symbol search dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(d => !d)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-xl font-semibold text-gray-900 dark:text-white hover:border-violet-400 transition-colors min-w-[200px]"
          >
            <BarChart2 className="w-4 h-4 text-violet-500" />
            <span className="flex-1 text-left">{selectedSymbol}</span>
            {quote && (
              <span className="text-xs text-gray-500 font-normal truncate max-w-[110px]">{quote.name}</span>
            )}
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>

          <AnimatePresence>
            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute z-50 mt-1 w-72 bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl shadow-2xl overflow-hidden"
              >
                <div className="p-2 border-b border-gray-100 dark:border-[#2a2d3a]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      autoFocus
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search stocks..."
                      className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 dark:bg-[#0f1117] rounded-xl border-0 outline-none text-gray-900 dark:text-white placeholder:text-gray-400"
                    />
                  </div>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {filtered.length === 0 && (
                    <p className="text-center text-sm text-gray-400 py-6">No results</p>
                  )}
                  {filtered.map(s => (
                    <button
                      key={s.symbol}
                      onClick={() => handleSelectSymbol(s.symbol)}
                      className={cn(
                        'w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors',
                        selectedSymbol === s.symbol && 'bg-violet-50 dark:bg-violet-900/20'
                      )}
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.symbol}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{s.name}</p>
                      </div>
                      <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">{s.sector}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 bg-gray-100 dark:bg-[#1a1d27] rounded-xl p-1 border border-gray-200 dark:border-[#2a2d3a]">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                period === p.value
                  ? 'bg-violet-600 text-white shadow'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Refresh */}
        <button
          onClick={() => loadStock(selectedSymbol, period)}
          disabled={isLoading}
          className="p-2.5 rounded-xl border border-gray-200 dark:border-[#2a2d3a] bg-white dark:bg-[#1a1d27] text-gray-500 hover:text-violet-600 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-gray-100 dark:bg-[#1a1d27] rounded-xl p-1 border border-gray-200 dark:border-[#2a2d3a] w-fit">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap',
              activeTab === tab
                ? 'bg-white dark:bg-[#0f1117] text-gray-900 dark:text-white shadow'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'Overview' && (
          <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {loadingQuote ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {[1, 2].map(i => (
                  <div key={i} className="h-48 bg-gray-100 dark:bg-[#1a1d27] rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : quote && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Quote card */}
                <div className="bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{quote.sector}</p>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">{quote.name}</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400">NSE: {quote.symbol}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">₹{fmt(quote.price)}</p>
                      <p className={cn('text-sm font-semibold flex items-center gap-1 justify-end', quote.change >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                        {quote.change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {quote.change >= 0 ? '+' : ''}{fmt(quote.change)} ({quote.change >= 0 ? '+' : ''}{fmt(quote.change_pct)}%)
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Volume', value: (quote.volume / 1e5).toFixed(2) + 'L' },
                      { label: 'Market Cap', value: fmtK(quote.market_cap) },
                      { label: 'P/E Ratio', value: quote.pe_ratio ? fmt(quote.pe_ratio) : '—' },
                      { label: '52W High', value: quote.week_52_high ? `₹${fmt(quote.week_52_high, 0)}` : '—' },
                      { label: '52W Low', value: quote.week_52_low ? `₹${fmt(quote.week_52_low, 0)}` : '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-gray-50 dark:bg-[#0f1117] rounded-xl p-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Signal card */}
                {signal && (
                  <div className="bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Zap className="w-5 h-5 text-violet-500" />
                      <h3 className="font-bold text-gray-900 dark:text-white">AI Signal Analysis</h3>
                    </div>

                    <div className="flex flex-col items-center mb-4">
                      <SignalBadge direction={signal.direction} confidence={signal.confidence} />
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {[
                        { label: 'RSI (14)', value: fmt(signal.rsi), color: signal.rsi < 35 ? 'text-emerald-500' : signal.rsi > 65 ? 'text-red-500' : 'text-yellow-500' },
                        { label: 'MACD', value: fmt(signal.macd, 4), color: signal.macd > signal.macd_signal ? 'text-emerald-500' : 'text-red-500' },
                        { label: 'SMA 20/50', value: `${fmt(signal.sma20, 0)} / ${fmt(signal.sma50, 0)}`, color: signal.sma20 > signal.sma50 ? 'text-emerald-500' : 'text-red-500' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="bg-gray-50 dark:bg-[#0f1117] rounded-xl p-2 text-center">
                          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                          <p className={cn('text-sm font-bold', color)}>{value}</p>
                        </div>
                      ))}
                    </div>

                    {signal.recommendation && (
                      <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/40 rounded-xl p-3">
                        <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed font-medium">{signal.recommendation}</p>
                      </div>
                    )}

                    <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {signal.disclaimer}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Mini price chart in overview */}
            {candles.length > 0 && (
              <div className="bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl p-5">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Price &amp; Volume</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                    <defs>
                      <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} interval="preserveStartEnd" />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={v => `₹${Math.round(v)}`} width={60} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="close" name="Close" stroke="#7c3aed" fill="url(#priceGrad)" strokeWidth={2} dot={false} />
                    {chartData[0]?.sma20 && <Line type="monotone" dataKey="sma20" name="SMA 20" stroke="#f59e0b" strokeWidth={1.5} dot={false} />}
                    {chartData[0]?.sma50 && <Line type="monotone" dataKey="sma50" name="SMA 50" stroke="#06b6d4" strokeWidth={1.5} dot={false} />}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Charts Tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'Charts' && (
          <motion.div key="charts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {loadingChart ? (
              <div className="space-y-4">
                {[300, 160, 200, 180, 160].map((h, i) => (
                  <div key={i} style={{ height: h }} className="bg-gray-100 dark:bg-[#1a1d27] rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : candles.length > 0 ? (
              <>
                {/* ── Price + SMA gradient area chart ──────────────────── */}
                <div className="bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Price Chart</h3>
                    {quote && (
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-gray-900 dark:text-white">₹{fmt(quote.price)}</span>
                        <span className={cn('text-sm font-semibold px-2 py-0.5 rounded-full', quote.change >= 0 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400')}>
                          {quote.change >= 0 ? '+' : ''}{fmt(quote.change_pct)}%
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-4 mb-3 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-violet-500 inline-block rounded" /> Close</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-amber-400 inline-block rounded" /> SMA 20</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-cyan-400 inline-block rounded" /> SMA 50</span>
                  </div>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                      <defs>
                        <linearGradient id="chartPriceGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.15)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} interval={Math.floor(chartData.length / 7)} axisLine={false} tickLine={false} />
                      <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={v => `₹${Math.round(v)}`} width={68} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="close" name="Close" stroke="#7c3aed" fill="url(#chartPriceGrad)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#7c3aed', strokeWidth: 2, stroke: '#fff' }} />
                      <Line type="monotone" dataKey="sma20" name="SMA 20" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="sma50" name="SMA 50" stroke="#06b6d4" strokeWidth={1.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* ── Volume bars ───────────────────────────────────────── */}
                <div className="bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl p-5">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Volume</h3>
                  <ResponsiveContainer width="100%" height={130}>
                    <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                      <defs>
                        <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.9} />
                          <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.4} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.15)" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6b7280' }} interval={Math.floor(chartData.length / 7)} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} tickFormatter={v => `${(v / 1e5).toFixed(0)}L`} width={44} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="volume" name="Volume" fill="url(#volGrad)" radius={[3, 3, 0, 0]} maxBarSize={12} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* ── RSI chart ─────────────────────────────────────────── */}
                <div className="bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">RSI (14)</h3>
                    {signal && (
                      <span className={cn('text-sm font-bold px-2.5 py-0.5 rounded-full', signal.rsi < 35 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : signal.rsi > 65 ? 'bg-red-100 dark:bg-red-900/30 text-red-500' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-500')}>
                        {fmt(signal.rsi, 1)} — {signal.rsi < 35 ? 'Oversold' : signal.rsi > 65 ? 'Overbought' : 'Neutral'}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-4 mb-3 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-violet-500 inline-block rounded" /> RSI</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-400 inline-block rounded border-dashed" /> Overbought (70)</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-400 inline-block rounded" /> Oversold (30)</span>
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                      <defs>
                        <linearGradient id="rsiGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.15)" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6b7280' }} interval={Math.floor(chartData.length / 7)} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} ticks={[0, 30, 50, 70, 100]} tick={{ fontSize: 9, fill: '#6b7280' }} width={30} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1.5} />
                      <ReferenceLine y={30} stroke="#10b981" strokeDasharray="4 2" strokeWidth={1.5} />
                      <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="2 4" strokeWidth={1} />
                      <Area type="monotone" dataKey="rsi" name="RSI" stroke="#7c3aed" fill="url(#rsiGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#7c3aed' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* ── MACD chart ────────────────────────────────────────── */}
                <div className="bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl p-5">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">MACD</h3>
                  <div className="flex gap-4 mb-3 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-violet-500 inline-block rounded" /> MACD</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-amber-400 inline-block rounded" /> Signal</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-emerald-500/50 dark:bg-emerald-400/50 inline-block rounded-sm" /> Histogram</span>
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.15)" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6b7280' }} interval={Math.floor(chartData.length / 7)} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} width={44} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} />
                      <Bar dataKey="macd_hist" name="Histogram"
                        fill="#10b981"
                        radius={[2, 2, 0, 0]}
                        maxBarSize={8}
                      />
                      <Line type="monotone" dataKey="macd" name="MACD" stroke="#7c3aed" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="macd_signal" name="Signal" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* ── Bollinger Bands ───────────────────────────────────── */}
                <div className="bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl p-5">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Bollinger Bands</h3>
                  <div className="flex flex-wrap gap-4 mb-3 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-violet-500 inline-block rounded" /> Close</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-400 inline-block rounded" /> Upper</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-gray-400 inline-block rounded" /> Mid</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-400 inline-block rounded" /> Lower</span>
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                      <defs>
                        <linearGradient id="bbBandGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6b7280" stopOpacity={0.12} />
                          <stop offset="95%" stopColor="#6b7280" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.15)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} interval={Math.floor(chartData.length / 7)} axisLine={false} tickLine={false} />
                      <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={v => `₹${Math.round(v)}`} width={68} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="bb_upper" name="BB Upper" stroke="#ef4444" fill="url(#bbBandGrad)" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                      <Line type="monotone" dataKey="bb_mid" name="BB Mid" stroke="#9ca3af" strokeWidth={1} dot={false} />
                      <Line type="monotone" dataKey="bb_lower" name="BB Lower" stroke="#10b981" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                      <Line type="monotone" dataKey="close" name="Close" stroke="#7c3aed" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#7c3aed' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <BarChart2 className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">No chart data available. Try a different period.</p>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Prediction Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'Prediction' && (
          <motion.div key="prediction" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {loadingSignal ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 dark:bg-[#1a1d27] rounded-2xl animate-pulse" />)}
              </div>
            ) : signal ? (
              <>
                {/* Summary card with gauge */}
                <div className="bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl p-5">
                  <div className="flex flex-col md:flex-row md:items-center gap-5">
                    <div className="flex flex-col items-center shrink-0">
                      <ConfidenceGauge value={signal.confidence} direction={signal.direction} />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Confidence Level</p>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <SignalBadge direction={signal.direction} confidence={signal.confidence} />
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-200 font-medium mb-3">{signal.recommendation}</p>
                      <div className="flex gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                          <span className="text-gray-500 dark:text-gray-400">{signal.bullish_signals} Bullish signals</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                          <span className="text-gray-500 dark:text-gray-400">{signal.bearish_signals} Bearish signals</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Per-indicator breakdown */}
                <div>
                  <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-violet-500" />
                    Signal Breakdown
                  </h3>
                  <div className="space-y-3">
                    {(signal.signals ?? []).map((s, i) => {
                      const leftColor = s.direction === 'BULLISH'
                        ? 'border-l-emerald-500 bg-emerald-50 dark:bg-emerald-900/10'
                        : s.direction === 'BEARISH'
                          ? 'border-l-red-500 bg-red-50 dark:bg-red-900/10'
                          : 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-900/10'
                      const textColor = s.direction === 'BULLISH' ? 'text-emerald-500' : s.direction === 'BEARISH' ? 'text-red-500' : 'text-yellow-500'
                      const DirIcon = s.direction === 'BULLISH' ? TrendingUp : s.direction === 'BEARISH' ? TrendingDown : Minus
                      return (
                        <motion.div key={i}
                          initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.06 }}
                          className={cn('border-l-4 rounded-r-2xl px-4 py-3', leftColor)}>
                          <div className="flex items-center gap-2 mb-1">
                            <DirIcon className={cn('w-3.5 h-3.5', textColor)} />
                            <p className="text-sm font-bold text-gray-900 dark:text-white">{s.name}</p>
                            <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',
                              s.direction === 'BULLISH' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                              : s.direction === 'BEARISH' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                              : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                            )}>{s.direction}</span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-300">{s.reason}</p>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>

                <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{signal.disclaimer}</span>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>Signal unavailable for {selectedSymbol}</p>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Indicators Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'Indicators' && (
          <motion.div key="indicators" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {signal && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* RSI gauge + chart */}
                <div className="bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-violet-500" />
                      <span className="font-semibold text-gray-900 dark:text-white">RSI (14)</span>
                    </div>
                    <RSIGauge value={signal.rsi} />
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                    <div className="flex justify-between"><span>Oversold zone</span><span className="text-emerald-500">Below 35</span></div>
                    <div className="flex justify-between"><span>Overbought zone</span><span className="text-red-500">Above 65</span></div>
                    <div className="flex justify-between"><span>Current RSI</span><span className={cn('font-semibold', signal.rsi < 35 ? 'text-emerald-500' : signal.rsi > 65 ? 'text-red-500' : 'text-yellow-500')}>{fmt(signal.rsi)}</span></div>
                  </div>
                  {candles.length > 0 && (
                    <ResponsiveContainer width="100%" height={120} className="mt-4">
                      <LineChart data={chartData.slice(-60)} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                        <XAxis hide />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#6b7280' }} width={25} />
                        <Tooltip content={<ChartTooltip />} />
                        <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" />
                        <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="rsi" name="RSI" stroke="#7c3aed" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* MACD */}
                <div className="bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-4 h-4 text-violet-500" />
                    <span className="font-semibold text-gray-900 dark:text-white">MACD</span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 mb-4">
                    <div className="flex justify-between"><span>MACD Line</span><span className={signal.macd > 0 ? 'text-emerald-500' : 'text-red-500'}>{fmt(signal.macd, 4)}</span></div>
                    <div className="flex justify-between"><span>Signal Line</span><span className="text-amber-500">{fmt(signal.macd_signal, 4)}</span></div>
                    <div className="flex justify-between"><span>Histogram</span><span className={(signal.macd - signal.macd_signal) > 0 ? 'text-emerald-500' : 'text-red-500'}>{fmt(signal.macd - signal.macd_signal, 4)}</span></div>
                  </div>
                  {candles.length > 0 && (
                    <ResponsiveContainer width="100%" height={130}>
                      <BarChart data={chartData.slice(-60)} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                        <XAxis hide />
                        <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} width={35} />
                        <Tooltip content={<ChartTooltip />} />
                        <ReferenceLine y={0} stroke="#6b7280" />
                        <Bar dataKey="macd_hist" name="Histogram"
                          fill="#10b981" radius={[2, 2, 0, 0]}
                          label={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}

            {/* Indicators value table */}
            {signal && (
              <div className="bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Target className="w-4 h-4 text-violet-500" />
                  <span className="font-semibold text-gray-900 dark:text-white">All Indicators</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-[#2a2d3a]">
                        <th className="text-left pb-2 font-medium">Indicator</th>
                        <th className="text-right pb-2 font-medium">Value</th>
                        <th className="text-right pb-2 font-medium">Signal</th>
                        <th className="text-left pb-2 pl-4 font-medium">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-[#2a2d3a]">
                      {[
                        { n:'RSI (14)', v:fmt(signal.rsi), sig:signal.rsi<30?'OVERSOLD':signal.rsi>70?'OVERBOUGHT':signal.rsi>50?'BULLISH':'BEARISH', c:signal.rsi<30?'text-emerald-500':signal.rsi>70?'text-red-500':signal.rsi>50?'text-emerald-500':'text-red-500', note:signal.rsi<30?'Oversold – bounce possible':signal.rsi>70?'Overbought – watch for reversal':'Momentum '+(signal.rsi>50?'positive':'weak') },
                        { n:'MACD', v:fmt(signal.macd,4), sig:signal.macd>signal.macd_signal?'BULLISH':'BEARISH', c:signal.macd>signal.macd_signal?'text-emerald-500':'text-red-500', note:signal.macd>signal.macd_signal?'MACD above signal – uptrend':'MACD below signal – downtrend' },
                        { n:'SMA 20', v:`₹${fmt(signal.sma20,0)}`, sig:(signal.current_price??0)>signal.sma20?'ABOVE':'BELOW', c:(signal.current_price??0)>signal.sma20?'text-emerald-500':'text-red-500', note:'20-day simple moving average' },
                        { n:'SMA 50', v:`₹${fmt(signal.sma50,0)}`, sig:(signal.current_price??0)>signal.sma50?'ABOVE':'BELOW', c:(signal.current_price??0)>signal.sma50?'text-emerald-500':'text-red-500', note:'50-day simple moving average' },
                        { n:'BB Upper', v:`₹${fmt(signal.bb_upper,0)}`, sig:(signal.current_price??0)<signal.bb_upper?'NORMAL':'OVERBOUGHT', c:(signal.current_price??0)<signal.bb_upper?'text-gray-400':'text-red-500', note:'Upper Bollinger Band (20,2)' },
                        { n:'BB Lower', v:`₹${fmt(signal.bb_lower,0)}`, sig:(signal.current_price??0)>signal.bb_lower?'NORMAL':'OVERSOLD', c:(signal.current_price??0)>signal.bb_lower?'text-gray-400':'text-emerald-500', note:'Lower Bollinger Band (20,2)' },
                        { n:'BB Width', v:signal.bb_width?fmt(signal.bb_width)+'%':'—', sig:(signal.bb_width??0)>5?'WIDE':'NARROW', c:(signal.bb_width??0)>5?'text-amber-500':'text-gray-400', note:'Wide = high volatility' },
                        { n:'Stoch %K', v:signal.stoch_k?fmt(signal.stoch_k):'—', sig:signal.stoch_k<20?'OVERSOLD':signal.stoch_k>80?'OVERBOUGHT':'NEUTRAL', c:signal.stoch_k<20?'text-emerald-500':signal.stoch_k>80?'text-red-500':'text-yellow-500', note:'<20 oversold; >80 overbought' },
                        { n:'Stoch %D', v:signal.stoch_d?fmt(signal.stoch_d):'—', sig:signal.stoch_k>signal.stoch_d?'BULLISH':'BEARISH', c:signal.stoch_k>signal.stoch_d?'text-emerald-500':'text-red-500', note:'K above D = bullish crossover' },
                        { n:'ATR (14)', v:signal.atr?`₹${fmt(signal.atr,0)}`:'—', sig:'VOLATILITY', c:'text-violet-400', note:'Daily price volatility range' },
                        { n:'Volume Ratio', v:signal.volume_ratio?fmt(signal.volume_ratio)+'x':'—', sig:(signal.volume_ratio??0)>1.5?'HIGH':(signal.volume_ratio??0)<0.8?'LOW':'NORMAL', c:(signal.volume_ratio??0)>1.5?'text-amber-500':'text-gray-400', note:'>1.5x = unusual activity' },
                        { n:'Support', v:`₹${fmt(signal.support,0)}`, sig:'LEVEL', c:'text-emerald-500', note:'20-session low' },
                        { n:'Resistance', v:`₹${fmt(signal.resistance,0)}`, sig:'LEVEL', c:'text-red-500', note:'20-session high' },
                      ].map(({ n, v, sig, c, note }) => (
                        <tr key={n} className="hover:bg-gray-50 dark:hover:bg-[#0f1117] transition-colors">
                          <td className="py-2.5 font-medium text-gray-700 dark:text-gray-200 text-xs">{n}</td>
                          <td className="py-2.5 text-right font-mono text-gray-900 dark:text-white text-xs">{v}</td>
                          <td className="py-2.5 text-right"><span className={cn('text-xs font-bold', c)}>{sig}</span></td>
                          <td className="py-2.5 pl-4 text-xs text-gray-500 dark:text-gray-400">{note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── News Tab ────────────────────────────────────────────────────────── */}
        {activeTab === 'News' && (
          <motion.div key="news" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Newspaper className="w-4 h-4" />
                <span>Live news from ET, Moneycontrol, Business Standard &amp; more</span>
              </div>
              <button onClick={() => loadNews(selectedSymbol)} disabled={loadingNews}
                className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-700 disabled:opacity-40">
                <RefreshCw className={cn('w-3.5 h-3.5', loadingNews && 'animate-spin')} /> Refresh
              </button>
            </div>

            {/* Sentiment tally */}
            {!loadingNews && news.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {(['positive','negative','neutral'] as const).map(s => {
                  const count = news.filter(a => a.sentiment === s).length
                  const color = s==='positive'?'text-emerald-500':s==='negative'?'text-red-500':'text-yellow-500'
                  const bg = s==='positive'?'bg-emerald-50 dark:bg-emerald-900/15 border-emerald-200 dark:border-emerald-800/30'
                    :s==='negative'?'bg-red-50 dark:bg-red-900/15 border-red-200 dark:border-red-800/30'
                    :'bg-yellow-50 dark:bg-yellow-900/15 border-yellow-200 dark:border-yellow-800/30'
                  return (
                    <div key={s} className={cn('border rounded-xl p-3 text-center', bg)}>
                      <p className={cn('text-2xl font-bold', color)}>{count}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{s}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {loadingNews ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 bg-gray-100 dark:bg-[#1a1d27] rounded-2xl animate-pulse" />
              ))
            ) : news.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Newspaper className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>No news articles found. RSS feeds may be unavailable.</p>
              </div>
            ) : (
              news.map((article, i) => {
                const leftBorder = article.sentiment==='positive'?'border-l-emerald-500'
                  :article.sentiment==='negative'?'border-l-red-500':'border-l-yellow-500'
                const sentBadge = article.sentiment==='positive'
                  ?'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                  :article.sentiment==='negative'
                  ?'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  :'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={cn('bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] border-l-4 rounded-r-2xl p-4 group', leftBorder)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                          <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">{article.source}</span>
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold capitalize', sentBadge)}>
                            {article.sentiment}
                          </span>
                          {article.is_stock_specific && (
                            <span className="text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded-full">
                              {selectedSymbol} Specific
                            </span>
                          )}
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                            article.impact==='HIGH'?'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400':'bg-gray-100 dark:bg-gray-700 text-gray-500'
                          )}>{article.impact} Impact</span>
                          {article.published && <span className="text-xs text-gray-400">{article.published.slice(0,16)}</span>}
                        </div>
                        <a href={article.link} target="_blank" rel="noopener noreferrer"
                          className="text-sm font-semibold text-gray-900 dark:text-white hover:text-violet-600 dark:hover:text-violet-400 line-clamp-2 leading-snug block">
                          {article.title}
                        </a>
                        {article.summary && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{article.summary}</p>
                        )}
                        {article.reason && (
                          <div className="mt-2 flex items-start gap-1.5 bg-gray-50 dark:bg-[#0f1117] rounded-lg px-3 py-2">
                            <Zap className="w-3 h-3 text-violet-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wide mb-0.5">Why this matters</p>
                              <p className="text-xs text-gray-600 dark:text-gray-300">{article.reason}</p>
                            </div>
                          </div>
                        )}
                      </div>
                      <a href={article.link} target="_blank" rel="noopener noreferrer"
                        className="text-gray-400 dark:text-gray-500 hover:text-violet-500 flex-shrink-0 mt-0.5">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </motion.div>
                )
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Disclaimer */}
      <div className="flex items-center gap-2 text-xs text-gray-400 pt-2 border-t border-gray-100 dark:border-[#2a2d3a]">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        <span>
          Beyond Charts is for educational purposes only. Not financial advice. 
          Past performance ≠ future results. Always consult a qualified financial advisor before trading.
        </span>
      </div>
    </div>
  )
}
