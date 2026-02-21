/**
 * SMS Alerts Page
 *
 * Real-time and historical view of bank SMS messages processed by Incomiq.
 * Shows:
 *  - Live connection status
 *  - Recent SMS transactions with risk scores
 *  - Setup instructions for httpSMS
 *  - Filter by type (credit/debit/all) and risk level
 */

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
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
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { useWebSocket, type SMSAlertEvent } from '@/lib/useWebSocket'
import SMSAlertToast from '@/components/sms/SMSAlertToast'
import TransactionClarifyDialog from '@/components/sms/TransactionClarifyDialog'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

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
  setup_instructions: Record<string, string>
}

const RISK_COLORS: Record<string, string> = {
  safe: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  warning: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  high_risk: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  critical: 'text-red-400 bg-red-500/10 border-red-500/20',
}

export default function SMSAlertsPage() {
  const user = useAppStore((s) => s.user)
  const [records, setRecords] = useState<SMSRecord[]>([])
  const [liveAlerts, setLiveAlerts] = useState<SMSAlertEvent[]>([])
  const [activeClarification, setActiveClarification] = useState<ReturnType<typeof useWebSocket>['pendingClarifications'][0] | null>(null)
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null)
  const [copiedField, setCopiedField] = useState<string>('')
  const [loadingRecords, setLoadingRecords] = useState(true)
  const [filterType, setFilterType] = useState<'all' | 'credit' | 'debit'>('all')
  const [filterRisk, setFilterRisk] = useState<string>('all')

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
  }, [fetchRecords, fetchWebhookInfo])

  // Show next pending clarification when dialog closes
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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Smartphone className="text-violet-400" size={24} />
            Live SMS Alerts
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Real-time bank transaction monitoring via SMS
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${
            isConnected
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>
            {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
            {isConnected ? 'Live' : 'Offline'}
          </div>
          <button
            onClick={fetchRecords}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total SMS', value: stats.total, icon: Activity, color: 'text-violet-400' },
          { label: 'Credits', value: stats.credits, icon: TrendingUp, color: 'text-emerald-400' },
          { label: 'Debits', value: stats.debits, icon: TrendingDown, color: 'text-red-400' },
          { label: 'High Risk', value: stats.highRisk, icon: AlertTriangle, color: 'text-orange-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 border border-white/10 rounded-2xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon size={16} className={color} />
              <span className="text-white/50 text-xs">{label}</span>
            </div>
            <p className="text-white font-bold text-2xl">{value}</p>
          </motion.div>
        ))}
      </div>

      {/* Main content: records + setup guide */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Records list */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {['all', 'credit', 'debit'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type as 'all' | 'credit' | 'debit')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                  filterType === type
                    ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                    : 'border-white/10 text-white/40 hover:border-white/20'
                }`}
              >
                {type === 'all' ? 'All' : type === 'credit' ? '↑ Credits' : '↓ Debits'}
              </button>
            ))}
            <div className="w-px h-4 bg-white/10" />
            {['all', 'safe', 'warning', 'high_risk', 'critical'].map((risk) => (
              <button
                key={risk}
                onClick={() => setFilterRisk(risk)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                  filterRisk === risk
                    ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                    : 'border-white/10 text-white/40 hover:border-white/20'
                }`}
              >
                {risk === 'all' ? 'All Risk' : risk.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Records */}
          {loadingRecords ? (
            <div className="flex items-center justify-center py-12 text-white/30">
              <RefreshCw size={20} className="animate-spin mr-2" />
              Loading...
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
              <Smartphone size={32} className="mx-auto mb-3 text-white/20" />
              <p className="text-white/40 font-medium">No SMS records yet</p>
              <p className="text-white/25 text-sm mt-1">
                Set up httpSMS on your phone to start receiving alerts
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRecords.map((record) => (
                <motion.div
                  key={record.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white/5 border border-white/10 hover:border-white/20 rounded-2xl p-4 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${
                        record.parsed_type === 'credit' ? 'bg-emerald-500/15' : 'bg-red-500/15'
                      }`}>
                        {record.parsed_type === 'credit' ? (
                          <TrendingUp size={14} className="text-emerald-400" />
                        ) : (
                          <TrendingDown size={14} className="text-red-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-white font-semibold`}>
                            {record.parsed_type === 'credit' ? '+' : '-'}
                            {record.parsed_amount ? formatCurrency(record.parsed_amount) : '?'}
                          </span>
                          {record.risk_level && (
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${RISK_COLORS[record.risk_level] ?? ''}`}>
                              {record.risk_level === 'high_risk' ? 'High Risk' : record.risk_level}
                            </span>
                          )}
                          {record.auto_processed && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400">
                              Auto-saved
                            </span>
                          )}
                        </div>
                        <p className="text-white/50 text-xs mt-0.5">
                          {record.parsed_merchant || record.sender_id || 'Unknown'} · {record.parsed_mode} · {record.bank_name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {record.risk_score !== undefined && (
                        <div className="flex items-center gap-1 text-xs text-white/30">
                          <Shield size={10} />
                          {record.risk_score.toFixed(0)}/100
                        </div>
                      )}
                      <p className="text-white/25 text-xs mt-1">
                        {new Date(record.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  {/* SMS snippet */}
                  <p className="text-white/30 text-xs mt-2 line-clamp-2 font-mono leading-relaxed">
                    {record.content}
                  </p>

                  {record.needs_clarification && !record.clarified && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
                      <AlertTriangle size={10} />
                      Awaiting categorization
                    </div>
                  )}
                  {record.clarified && record.clarification_category && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
                      <CheckCheck size={10} />
                      Categorized as: {record.clarification_category}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Setup guide */}
        <div className="space-y-4">
          {/* Connection Status */}
          <div className={`rounded-2xl border p-4 ${
            isConnected
              ? 'bg-emerald-950/40 border-emerald-500/30'
              : 'bg-gray-900/40 border-white/10'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {isConnected ? (
                <Wifi size={16} className="text-emerald-400" />
              ) : (
                <WifiOff size={16} className="text-white/40" />
              )}
              <span className={`text-sm font-medium ${isConnected ? 'text-emerald-300' : 'text-white/40'}`}>
                {isConnected ? 'WebSocket Connected' : 'Not Connected'}
              </span>
            </div>
            <p className="text-white/40 text-xs">
              {isConnected
                ? 'Live alerts are active. SMS transactions will appear instantly.'
                : 'Connect to receive real-time transaction alerts.'}
            </p>
          </div>

          {/* httpSMS Setup */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <Info size={16} className="text-violet-400" />
              <h3 className="text-white font-semibold">httpSMS Setup</h3>
            </div>
            <p className="text-white/50 text-xs mb-4 leading-relaxed">
              Install the <strong className="text-white/70">httpSMS</strong> app on your Android phone
              to forward bank SMS messages to Incomiq automatically.
            </p>

            <a
              href="https://httpsms.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 w-full justify-center py-2.5 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-300 text-sm font-medium hover:bg-violet-600/30 transition-colors mb-4"
            >
              <ExternalLink size={14} />
              Download httpSMS
            </a>

            {webhookInfo && (
              <div className="space-y-3">
                <p className="text-white/40 text-xs font-medium uppercase tracking-wide">
                  Configuration
                </p>
                {[
                  { label: 'Webhook URL', value: webhookInfo.webhook_url, field: 'url' },
                  { label: 'Secret Header', value: webhookInfo.secret, field: 'secret' },
                  { label: 'User ID Header', value: webhookInfo.user_id, field: 'uid' },
                ].map(({ label, value, field }) => (
                  <div key={field} className="bg-black/30 rounded-xl p-3">
                    <p className="text-white/40 text-xs mb-1">{label}</p>
                    <div className="flex items-center gap-2">
                      <code className="text-white/80 text-xs flex-1 truncate font-mono">{value}</code>
                      <button
                        onClick={() => copyToClipboard(value, field)}
                        className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                      >
                        {copiedField === field ? (
                          <CheckCheck size={12} className="text-emerald-400" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  <p className="text-amber-400 text-xs font-medium mb-1">📱 Header Setup</p>
                  <p className="text-amber-300/70 text-xs leading-relaxed">
                    In httpSMS, add these headers:<br />
                    <strong>X-Webhook-Secret</strong>: {webhookInfo.secret}<br />
                    <strong>X-User-Id</strong>: {webhookInfo.user_id}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Risk legend */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={16} className="text-yellow-400" />
              <h3 className="text-white font-semibold text-sm">Risk Levels</h3>
            </div>
            <div className="space-y-2">
              {[
                { level: 'safe', icon: ShieldCheck, desc: '0-30: Normal spend', color: 'text-emerald-400' },
                { level: 'warning', icon: AlertTriangle, desc: '31-60: Monitor closely', color: 'text-yellow-400' },
                { level: 'high_risk', icon: AlertTriangle, desc: '61-80: Non-essential', color: 'text-orange-400' },
                { level: 'critical', icon: Zap, desc: '81-100: Dirty spend alert', color: 'text-red-400' },
              ].map(({ level, icon: Icon, desc, color }) => (
                <div key={level} className="flex items-center gap-2">
                  <Icon size={12} className={color} />
                  <span className="text-white/50 text-xs">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Live alert toasts */}
      <SMSAlertToast
        alerts={liveAlerts}
        onDismiss={(id) => setLiveAlerts((prev) => prev.filter((a) => a.sms_id !== id))}
        onCategorize={(alert) => {
          const pending = pendingClarifications.find((c) => c.sms_id === alert.sms_id)
          if (pending) setActiveClarification(pending)
        }}
      />

      {/* Transaction clarify dialog */}
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
