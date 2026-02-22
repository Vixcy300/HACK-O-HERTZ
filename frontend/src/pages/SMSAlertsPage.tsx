/**
 * SMS Alerts Page — Modern glassmorphism design.
 * White/blur aesthetic in light mode, frosted dark in dark mode.
 */

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Smartphone,
  Wifi,
  WifiOff,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ShieldCheck,
  Zap,
  RefreshCw,
  ExternalLink,
  Copy,
  CheckCheck,
  Info,
  Shield,
  Activity,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Link,
  Terminal,
  XCircle,
  CheckCircle2,
  Radio,
} from 'lucide-react'
import { useWebSocket, type SMSAlertEvent } from '@/lib/useWebSocket'
import SMSAlertToast from '@/components/sms/SMSAlertToast'
import TransactionClarifyDialog from '@/components/sms/TransactionClarifyDialog'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { useAppStore } from '@/store/useAppStore'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

interface SMSRecord {
  id: string
  content: string
  sender_id?: string
  parsed_amount?: number
  parsed_type?: string
  parsed_merchant?: string
  parsed_mode?: string
  bank_name?: string
  risk_score?: number
  risk_level?: string
  auto_processed: boolean
  needs_clarification: boolean
  clarified: boolean
  clarification_category?: string
  timestamp: string
}

interface WebhookInfo {
  webhook_url: string
  secret: string
  user_id: string
  is_localhost: boolean
  base_url: string
  setup_instructions: Record<string, string>
}

const RISK_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  safe:      { label: 'Safe',      bg: 'bg-emerald-100 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-500/30', dot: 'bg-emerald-500 dark:bg-emerald-400' },
  warning:   { label: 'Warning',   bg: 'bg-amber-100 dark:bg-yellow-500/15',    text: 'text-amber-700 dark:text-yellow-300',    border: 'border-amber-300 dark:border-yellow-500/30',   dot: 'bg-amber-500 dark:bg-yellow-400' },
  high_risk: { label: 'High Risk', bg: 'bg-orange-100 dark:bg-orange-500/15',   text: 'text-orange-700 dark:text-orange-300',   border: 'border-orange-300 dark:border-orange-500/30',  dot: 'bg-orange-500 dark:bg-orange-400' },
  critical:  { label: 'Critical',  bg: 'bg-red-100 dark:bg-red-500/15',         text: 'text-red-700 dark:text-red-300',         border: 'border-red-300 dark:border-red-500/30',        dot: 'bg-red-500 dark:bg-red-400' },
}

export default function SMSAlertsPage() {
  useAppStore()
  const [records, setRecords] = useState<SMSRecord[]>([])
  const [liveAlerts, setLiveAlerts] = useState<SMSAlertEvent[]>([])
  const [activeClarification, setActiveClarification] = useState<ReturnType<typeof useWebSocket>['pendingClarifications'][0] | null>(null)
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null)
  const [copiedField, setCopiedField] = useState<string>('')
  const [loadingRecords, setLoadingRecords] = useState(true)
  const [filterType, setFilterType] = useState<'all' | 'credit' | 'debit'>('all')
  const [filterRisk, setFilterRisk] = useState<string>('all')
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null)
  const [customUrl, setCustomUrl] = useState('')
  const [updatingUrl, setUpdatingUrl] = useState(false)
  const [showSetup, setShowSetup] = useState(false)

  const fetchRecords = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`${API_BASE}/sms/records?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setRecords(data.records || [])
      }
    } catch {
      // ignore
    } finally {
      setLoadingRecords(false)
    }
  }, [])

  const fetchWebhookInfo = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`${API_BASE}/sms/webhook-info`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setWebhookInfo(await res.json())
      }
    } catch {
      // ignore
    }
  }, [])

  const {
    isConnected,
    pendingClarifications,
    respondToClarification,
    dismissClarification,
  } = useWebSocket({
    onSMSAlert: (alert) => {
      setLiveAlerts((prev) => [...prev, alert])
      fetchRecords()
    },
    onIncomeAdded: fetchRecords,
    onExpenseAdded: fetchRecords,
    onClarificationNeeded: (evt) => {
      if (!activeClarification) setActiveClarification(evt)
    },
  })

  useEffect(() => {
    fetchRecords()
    fetchWebhookInfo()
    const autoRegisterPhone = async () => {
      const phone = useAppStore.getState().settings?.phoneNumber?.trim()
      if (!phone) return
      try {
        const token = localStorage.getItem('access_token')
        if (!token) return
        await fetch(`${API_BASE}/sms/register-device?phone=${encodeURIComponent(phone)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch {
        // silently ignore
      }
    }
    autoRegisterPhone()
  }, [fetchRecords, fetchWebhookInfo])

  useEffect(() => {
    if (!activeClarification && pendingClarifications.length > 0) {
      setActiveClarification(pendingClarifications[0])
    }
  }, [activeClarification, pendingClarifications])

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    toast.success('Copied!')
    setTimeout(() => setCopiedField(''), 2000)
  }

  const updateWebhookUrl = async (url: string) => {
    if (!url.startsWith('http')) { toast.error('URL must start with https://'); return }
    setUpdatingUrl(true)
    try {
      const res = await fetch(`${API_BASE}/sms/update-tunnel-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.replace(/\/$/, '') }),
      })
      if (res.ok) {
        toast.success('Webhook URL updated!')
        setCustomUrl('')
        await fetchWebhookInfo()
      } else {
        toast.error('Update failed')
      }
    } catch {
      toast.error('Could not reach backend')
    } finally {
      setUpdatingUrl(false)
    }
  }

  const filteredRecords = records.filter((r) => {
    if (filterType !== 'all' && r.parsed_type !== filterType) return false
    if (filterRisk !== 'all' && r.risk_level !== filterRisk) return false
    return true
  })

  const stats = {
    total: records.length,
    credits: records.filter((r) => r.parsed_type === 'credit').length,
    debits: records.filter((r) => r.parsed_type === 'debit').length,
    highRisk: records.filter((r) => r.risk_level === 'high_risk' || r.risk_level === 'critical').length,
  }

  // Glass card utility classnames
  const glass = 'bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl border border-gray-200/80 dark:border-white/[0.08]'
  const glassInner = 'bg-gray-50/80 dark:bg-black/20 border border-gray-100 dark:border-white/[0.06]'

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-violet-50/30 dark:from-[#0f1117] dark:via-[#0f1117] dark:to-[#13151f]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <Smartphone className="text-white" size={20} />
              </div>
              Live SMS Alerts
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 ml-13">
              Real-time bank transaction monitoring
            </p>
          </div>
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ scale: isConnected ? [1, 1.03, 1] : 1 }}
              transition={{ repeat: isConnected ? Infinity : 0, duration: 2.5 }}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium backdrop-blur-xl border ${
                isConnected
                  ? 'bg-emerald-500/10 border-emerald-300/50 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400'
                  : 'bg-gray-100/80 border-gray-200 text-gray-400 dark:bg-white/5 dark:border-white/10 dark:text-gray-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400 dark:bg-gray-600'}`} />
              {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
              {isConnected ? 'Live' : 'Offline'}
            </motion.div>
            <button
              onClick={fetchRecords}
              className={`p-2.5 rounded-xl ${glass} text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:border-violet-300 dark:hover:border-violet-500/30 transition-all shadow-sm`}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* ── Stats Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total SMS', value: stats.total, icon: MessageSquare, gradient: 'from-violet-500 to-purple-600', lightBg: 'bg-violet-50/80', lightBorder: 'border-violet-200/60' },
            { label: 'Credits', value: stats.credits, icon: TrendingUp, gradient: 'from-emerald-500 to-teal-600', lightBg: 'bg-emerald-50/80', lightBorder: 'border-emerald-200/60' },
            { label: 'Debits', value: stats.debits, icon: TrendingDown, gradient: 'from-rose-500 to-red-600', lightBg: 'bg-rose-50/80', lightBorder: 'border-rose-200/60' },
            { label: 'High Risk', value: stats.highRisk, icon: AlertTriangle, gradient: 'from-orange-500 to-amber-600', lightBg: 'bg-orange-50/80', lightBorder: 'border-orange-200/60' },
          ].map(({ label, value, icon: Icon, gradient, lightBg, lightBorder }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`relative overflow-hidden rounded-2xl p-4 backdrop-blur-xl shadow-sm border
                ${lightBg} ${lightBorder}
                dark:bg-white/[0.04] dark:border-white/[0.08]`}
            >
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-3 shadow-sm`}>
                <Icon size={16} className="text-white" />
              </div>
              <p className="text-gray-900 dark:text-white font-bold text-2xl leading-none">{value}</p>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">{label}</p>
            </motion.div>
          ))}
        </div>

        {/* ── Main Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Records */}
          <div className="lg:col-span-2 space-y-4">

            {/* Filter bar */}
            <div className={`${glass} rounded-2xl px-4 py-3 flex items-center gap-2 flex-wrap shadow-sm`}>
              <span className="text-gray-400 dark:text-gray-500 text-xs font-medium mr-1">Type:</span>
              {(['all', 'credit', 'debit'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filterType === type
                      ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/20'
                      : 'bg-gray-100/80 dark:bg-white/[0.06] text-gray-600 dark:text-gray-400 hover:bg-gray-200/80 dark:hover:bg-white/10'
                  }`}
                >
                  {type === 'all' ? 'All' : type === 'credit' ? '\u2191 Credits' : '\u2193 Debits'}
                </button>
              ))}
              <div className="w-px h-4 bg-gray-200/80 dark:bg-white/10 mx-1" />
              <span className="text-gray-400 dark:text-gray-500 text-xs font-medium mr-1">Risk:</span>
              {['all', 'safe', 'warning', 'high_risk', 'critical'].map((risk) => (
                <button
                  key={risk}
                  onClick={() => setFilterRisk(risk)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filterRisk === risk
                      ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/20'
                      : 'bg-gray-100/80 dark:bg-white/[0.06] text-gray-600 dark:text-gray-400 hover:bg-gray-200/80 dark:hover:bg-white/10'
                  }`}
                >
                  {risk === 'all' ? 'All' : risk === 'high_risk' ? 'High Risk' : risk.charAt(0).toUpperCase() + risk.slice(1)}
                </button>
              ))}
            </div>

            {/* Records list */}
            {loadingRecords ? (
              <div className={`${glass} rounded-2xl p-12 flex items-center justify-center shadow-sm`}>
                <RefreshCw size={22} className="animate-spin text-violet-500 mr-3" />
                <span className="text-gray-500 dark:text-gray-400">Loading records...</span>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className={`${glass} rounded-2xl p-12 text-center shadow-sm`}>
                <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center mx-auto mb-4">
                  <Smartphone size={28} className="text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-gray-700 dark:text-gray-300 font-semibold text-lg">No SMS records yet</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">
                  Set up httpSMS on your Android phone to start receiving alerts.
                </p>
              </div>
            ) : (
              <AnimatePresence>
                <div className="space-y-2">
                  {filteredRecords.map((record, i) => {
                    const risk = RISK_CONFIG[record.risk_level ?? 'safe'] ?? RISK_CONFIG.safe
                    const isExpanded = expandedRecord === record.id
                    const isCredit = record.parsed_type === 'credit'
                    return (
                      <motion.div
                        key={record.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className={`${glass} rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-gray-300/80 dark:hover:border-white/[0.15] transition-all`}
                      >
                        <button
                          className="w-full text-left p-4"
                          onClick={() => setExpandedRecord(isExpanded ? null : record.id)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                                isCredit
                                  ? 'bg-emerald-100 dark:bg-emerald-500/15'
                                  : 'bg-rose-100 dark:bg-red-500/15'
                              }`}>
                                {isCredit
                                  ? <TrendingUp size={16} className="text-emerald-600 dark:text-emerald-400" />
                                  : <TrendingDown size={16} className="text-rose-600 dark:text-red-400" />
                                }
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`font-bold text-base ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-red-400'}`}>
                                    {isCredit ? '+' : '-'}
                                    {record.parsed_amount ? formatCurrency(record.parsed_amount) : '?'}
                                  </span>
                                  {record.risk_level && (
                                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${risk.bg} ${risk.text} ${risk.border}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${risk.dot}`} />
                                      {risk.label}
                                    </span>
                                  )}
                                  {record.auto_processed && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/15 border border-violet-200 dark:border-violet-500/30 text-violet-700 dark:text-violet-300 flex items-center gap-1 font-medium">
                                      <CheckCheck size={10} />
                                      Auto-saved
                                    </span>
                                  )}
                                  {record.needs_clarification && !record.clarified && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 font-medium">
                                      Needs review
                                    </span>
                                  )}
                                </div>
                                <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5 truncate">
                                  {[record.parsed_merchant || record.sender_id || 'Unknown', record.parsed_mode, record.bank_name].filter(Boolean).join(' \u00b7 ')}
                                </p>
                              </div>
                            </div>

                            <div className="flex-shrink-0 flex items-center gap-3">
                              <div className="text-right hidden sm:block">
                                {record.risk_score !== undefined && (
                                  <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 justify-end">
                                    <Shield size={10} />
                                    <span>{record.risk_score.toFixed(0)}/100</span>
                                  </div>
                                )}
                                <p className="text-gray-400 dark:text-gray-500 text-xs">
                                  {new Date(record.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                              {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                            </div>
                          </div>
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden border-t border-gray-100 dark:border-white/[0.06]"
                            >
                              <div className="px-4 py-3 bg-gray-50/80 dark:bg-black/20">
                                <p className="text-gray-500 dark:text-gray-400 text-xs font-medium mb-2 flex items-center gap-1">
                                  <MessageSquare size={10} /> Full SMS
                                </p>
                                <p className="text-gray-700 dark:text-gray-200 text-sm font-mono leading-relaxed bg-white dark:bg-[#0f1117] rounded-xl px-3 py-2.5 border border-gray-200 dark:border-white/[0.08]">
                                  {record.content}
                                </p>
                                {record.clarified && record.clarification_category && (
                                  <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                                    <CheckCheck size={11} />
                                    Categorized as: <strong>{record.clarification_category}</strong>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )
                  })}
                </div>
              </AnimatePresence>
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">

            {/* ── Android Permission Warning ── */}
            <div className="bg-red-50/90 dark:bg-red-950/40 backdrop-blur-xl border-2 border-red-300 dark:border-red-500/60 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <XCircle size={16} className="text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="text-red-700 dark:text-red-300 font-bold text-sm">Android Permission Required</h3>
                  <p className="text-red-600/80 dark:text-red-400/80 text-xs">httpSMS needs SMS permissions to forward</p>
                </div>
              </div>
              <div className="space-y-2 mb-3">
                {[
                  'Open httpSMS on your Android phone',
                  'Tap the red "Missing Permission" banner',
                  'Allow SMS Read + SMS Receive permissions',
                  'Set httpSMS as your DEFAULT SMS App',
                  'Allow "Ignore Battery Optimisation"',
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-red-200 dark:bg-red-500/30 text-red-700 dark:text-red-200 flex items-center justify-center font-bold text-[10px]">{i + 1}</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
              <p className="text-red-600/80 dark:text-red-400/70 text-xs bg-red-100/80 dark:bg-red-500/10 rounded-xl p-2">
                Without SMS permissions, httpSMS won't forward messages to your webhook.
              </p>
            </div>

            {/* ── Connection Status ── */}
            <motion.div
              animate={isConnected ? { boxShadow: ['0 0 0 0 rgba(16,185,129,0)', '0 0 0 6px rgba(16,185,129,0.08)', '0 0 0 0 rgba(16,185,129,0)'] } : {}}
              transition={{ repeat: Infinity, duration: 3 }}
              className={`rounded-2xl border p-4 transition-colors backdrop-blur-xl ${
                isConnected
                  ? 'bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/30'
                  : `${glass}`
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                {isConnected
                  ? <Radio size={16} className="text-emerald-600 dark:text-emerald-400" />
                  : <WifiOff size={16} className="text-gray-400 dark:text-gray-500" />
                }
                <span className={`font-semibold text-sm ${isConnected ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-500 dark:text-gray-400'}`}>
                  {isConnected ? 'WebSocket Connected' : 'Not Connected'}
                </span>
              </div>
              <p className={`text-xs leading-relaxed ${isConnected ? 'text-emerald-600/80 dark:text-emerald-400/80' : 'text-gray-400 dark:text-gray-500'}`}>
                {isConnected
                  ? 'Live alerts active. Transactions appear instantly.'
                  : 'Connect to receive real-time transaction alerts.'}
              </p>
            </motion.div>

            {/* ── Webhook URL Card ── */}
            <div className={`${glass} rounded-2xl p-4 shadow-sm`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-500/15 flex items-center justify-center">
                  <Link size={14} className="text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-gray-900 dark:text-white font-semibold text-sm">Webhook URL</h3>
              </div>

              {webhookInfo?.is_localhost && (
                <div className="bg-orange-50/90 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/25 rounded-xl p-3 mb-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle size={12} className="text-orange-600 dark:text-orange-400 flex-shrink-0" />
                    <p className="text-orange-700 dark:text-orange-300 text-xs font-semibold">Localhost — Not reachable!</p>
                  </div>
                  <p className="text-orange-600/80 dark:text-orange-400/80 text-xs">
                    Run <code className="bg-orange-100 dark:bg-orange-500/10 px-1 rounded font-mono">start-sms-tunnel.ps1</code> then paste the URL below.
                  </p>
                </div>
              )}

              {webhookInfo && (
                <div className="space-y-2 mb-3">
                  {[
                    { label: 'Webhook URL', value: webhookInfo.webhook_url, field: 'url' },
                    { label: 'Secret (X-Webhook-Secret)', value: webhookInfo.secret, field: 'secret' },
                    { label: 'User ID (X-User-Id)', value: webhookInfo.user_id, field: 'uid' },
                  ].map(({ label, value, field }) => (
                    <div key={field} className={`${glassInner} rounded-xl p-3`}>
                      <p className="text-gray-400 dark:text-gray-500 text-xs mb-1">{label}</p>
                      <div className="flex items-center gap-2">
                        <code className="text-gray-800 dark:text-gray-200 text-xs flex-1 break-all font-mono leading-relaxed">{value}</code>
                        <button
                          onClick={() => copyToClipboard(value, field)}
                          className="flex-shrink-0 p-1.5 rounded-lg bg-gray-100/80 dark:bg-white/[0.06] hover:bg-violet-100 dark:hover:bg-violet-500/15 text-gray-400 dark:text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                        >
                          {copiedField === field ? <CheckCheck size={12} className="text-emerald-500" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-gray-100 dark:border-white/[0.06] pt-3">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">Update with tunnel URL:</p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={customUrl}
                    onChange={e => setCustomUrl(e.target.value)}
                    placeholder="https://xxxx.trycloudflare.com"
                    className="flex-1 text-xs bg-gray-50/80 dark:bg-black/20 border border-gray-200 dark:border-white/[0.08] rounded-xl px-3 py-2 text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 dark:focus:border-violet-500/40 min-w-0"
                  />
                  <button
                    onClick={() => updateWebhookUrl(customUrl)}
                    disabled={updatingUrl || !customUrl}
                    className="flex-shrink-0 px-3 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-medium rounded-xl transition-colors shadow-sm shadow-violet-500/20"
                  >
                    {updatingUrl ? <RefreshCw size={12} className="animate-spin" /> : 'Save'}
                  </button>
                </div>
              </div>
            </div>

            {/* ── Setup Guide (collapsible) ── */}
            <div className={`${glass} rounded-2xl shadow-sm overflow-hidden`}>
              <button
                onClick={() => setShowSetup(!showSetup)}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center">
                    <Terminal size={14} className="text-violet-600 dark:text-violet-400" />
                  </div>
                  <h3 className="text-gray-900 dark:text-white font-semibold text-sm">Setup Guide</h3>
                </div>
                {showSetup ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </button>

              <AnimatePresence>
                {showSetup && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-4">
                      {/* Tunnel setup */}
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs mb-2 leading-relaxed">
                          Run this script to get a free public URL (Cloudflare):
                        </p>
                        <div className="bg-gray-100/80 dark:bg-black/30 rounded-xl p-3 flex items-center justify-between gap-2">
                          <code className="text-emerald-700 dark:text-emerald-400 text-xs font-mono">.\start-sms-tunnel.ps1</code>
                          <button onClick={() => copyToClipboard('.\\start-sms-tunnel.ps1', 'script')}
                            className="p-1 rounded text-gray-400 hover:text-emerald-500 transition-colors">
                            {copiedField === 'script' ? <CheckCheck size={11} className="text-emerald-500" /> : <Copy size={11} />}
                          </button>
                        </div>
                        <div className="mt-2 space-y-1.5">
                          {[
                            { ok: true,  text: 'Free HTTPS tunnel, no account needed' },
                            { ok: true,  text: 'Auto-restarts after laptop sleep' },
                            { ok: true,  text: 'Auto-updates .env and app URL' },
                            { ok: false, text: 'URL changes each restart \u2014 update httpSMS' },
                          ].map(({ ok, text }, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              {ok
                                ? <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
                                : <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />}
                              <span className="text-gray-600 dark:text-gray-400">{text}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* httpSMS setup */}
                      <div>
                        <a
                          href="https://httpsms.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 w-full justify-center py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors shadow-sm shadow-violet-500/20"
                        >
                          <ExternalLink size={14} />
                          Download httpSMS (Android)
                        </a>
                        <div className="space-y-2 mt-3">
                          {[
                            'Install httpSMS on your Android phone',
                            'Fix ALL permissions (see red card above)',
                            'Open httpSMS \u2192 \u2699 Settings \u2192 Webhooks \u2192 +',
                            'Paste the Webhook URL shown above',
                            'Add header: X-Webhook-Secret = (your secret)',
                            'Enable "Incoming SMS" forwarding \u2192 Save',
                          ].map((step, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300 flex items-center justify-center font-bold text-[10px]">{i + 1}</span>
                              <span>{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Risk Legend ── */}
            <div className={`${glass} rounded-2xl p-4 shadow-sm`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-yellow-500/15 flex items-center justify-center">
                  <Zap size={14} className="text-amber-600 dark:text-yellow-400" />
                </div>
                <h3 className="text-gray-900 dark:text-white font-semibold text-sm">Risk Levels</h3>
              </div>
              <div className="space-y-2">
                {[
                  { icon: ShieldCheck,   desc: '0\u201330 \u2013 Normal transaction',  color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
                  { icon: Activity,      desc: '31\u201360 \u2013 Monitor closely',     color: 'text-amber-600 dark:text-yellow-400',    dot: 'bg-amber-500' },
                  { icon: AlertTriangle, desc: '61\u201380 \u2013 Non-essential spend', color: 'text-orange-600 dark:text-orange-400',   dot: 'bg-orange-500' },
                  { icon: Zap,           desc: '81\u2013100 \u2013 Suspicious alert',  color: 'text-red-600 dark:text-red-400',          dot: 'bg-red-500' },
                ].map(({ icon: Icon, desc, color, dot }) => (
                  <div key={desc} className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                    <Icon size={12} className={color} />
                    <span className="text-gray-600 dark:text-gray-300 text-xs">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Live alert toasts ── */}
      <SMSAlertToast
        alerts={liveAlerts}
        onDismiss={(id) => setLiveAlerts((prev) => prev.filter((a) => a.sms_id !== id))}
        onCategorize={(alert) => {
          const pending = pendingClarifications.find((c) => c.sms_id === alert.sms_id)
          if (pending) {
            setActiveClarification(pending)
            return
          }
          setActiveClarification({
            event: 'clarification_needed',
            timestamp: alert.timestamp,
            sms_id: alert.sms_id,
            amount: alert.amount,
            merchant: alert.merchant,
            risk_score: alert.risk_score,
            message: `Hey, you spent ${alert.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} \u2014 what was this for?`,
            suggested_categories: ['\ud83c\udf55 Food / Dining', '\ud83d\ude97 Transport / Fuel', '\ud83d\uded2 Groceries', '\ud83d\udca1 Utilities / Bills', '\ud83d\udc57 Shopping / Clothes', '\ud83c\udfae Entertainment'],
            ai_message: alert.ai_spending_insight
              ? `${alert.ai_spending_insight} What was this expense?`
              : undefined,
            spending_insight: alert.ai_spending_insight,
          })
        }}
      />

      {/* ── Clarification dialog ── */}
      <TransactionClarifyDialog
        event={activeClarification}
        onConfirm={(smsId, category, description, confirmedAs) => {
          respondToClarification(smsId, category, description, confirmedAs)
          setActiveClarification(null)
          fetchRecords()
        }}
        onDismiss={(smsId) => {
          dismissClarification(smsId)
          setActiveClarification(null)
        }}
      />
    </div>
  )
}
