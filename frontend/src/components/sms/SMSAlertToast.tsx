/**
 * SMSAlertModal
 *
 * Floating live-alert panel that appears in the bottom-right corner
 * whenever a new bank SMS is received via the WebSocket.
 *
 * Shows:
 *  - Transaction type (credit/debit) with icon
 *  - Amount and merchant
 *  - Risk level badge (safe / warning / high_risk / critical)
 *  - Alert message + suggestion from AI
 *  - "Categorize" CTA if the transaction needs clarification
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Zap,
  MessageSquare,
} from 'lucide-react'
import type { SMSAlertEvent } from '@/lib/useWebSocket'
import { formatCurrency } from '@/lib/utils'

interface SMSAlertToastProps {
  alerts: SMSAlertEvent[]
  onDismiss: (smsId: string) => void
  onCategorize: (alert: SMSAlertEvent) => void
}

const RISK_CONFIG = {
  safe: {
    bg: 'bg-emerald-950/90',
    border: 'border-emerald-500/40',
    badge: 'bg-emerald-500/20 text-emerald-300',
    icon: ShieldCheck,
    iconColor: 'text-emerald-400',
    label: 'Safe',
  },
  warning: {
    bg: 'bg-yellow-950/90',
    border: 'border-yellow-500/40',
    badge: 'bg-yellow-500/20 text-yellow-300',
    icon: AlertTriangle,
    iconColor: 'text-yellow-400',
    label: 'Watch Out',
  },
  high_risk: {
    bg: 'bg-orange-950/90',
    border: 'border-orange-500/40',
    badge: 'bg-orange-500/20 text-orange-300',
    icon: ShieldAlert,
    iconColor: 'text-orange-400',
    label: 'High Risk',
  },
  critical: {
    bg: 'bg-red-950/90',
    border: 'border-red-500/40',
    badge: 'bg-red-500/20 text-red-300',
    icon: Zap,
    iconColor: 'text-red-400',
    label: 'Critical',
  },
}

function SMSAlertCard({
  alert,
  onDismiss,
  onCategorize,
}: {
  alert: SMSAlertEvent
  onDismiss: (id: string) => void
  onCategorize: (a: SMSAlertEvent) => void
}) {
  const config = RISK_CONFIG[alert.risk_level] ?? RISK_CONFIG.warning
  const RiskIcon = config.icon
  const isCredit = alert.transaction_type === 'credit'

  return (
    <motion.div
      initial={{ opacity: 0, x: 80, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.9 }}
      className={`relative w-80 rounded-2xl border backdrop-blur-xl p-4 shadow-2xl ${config.bg} ${config.border}`}
    >
      {/* Close button */}
      <button
        onClick={() => onDismiss(alert.sms_id)}
        className="absolute top-3 right-3 p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
      >
        <X size={14} />
      </button>

      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`p-2 rounded-xl ${isCredit ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
          {isCredit ? (
            <TrendingUp size={18} className="text-emerald-400" />
          ) : (
            <TrendingDown size={18} className="text-red-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.badge}`}>
              {config.label}
            </span>
            <span className="text-xs text-white/40">{alert.transaction_mode}</span>
          </div>
          <p className="text-white font-bold text-lg leading-tight mt-0.5">
            {isCredit ? '+' : '-'}{formatCurrency(alert.amount)}
          </p>
          {alert.merchant && (
            <p className="text-white/60 text-xs truncate">{alert.merchant}</p>
          )}
        </div>
        <RiskIcon size={18} className={config.iconColor} />
      </div>

      {/* Risk score bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-white/40 mb-1">
          <span>Risk Score</span>
          <span className={config.iconColor}>{alert.risk_score.toFixed(0)}/100</span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              alert.risk_score >= 80
                ? 'bg-red-500'
                : alert.risk_score >= 60
                ? 'bg-orange-500'
                : alert.risk_score >= 30
                ? 'bg-yellow-500'
                : 'bg-emerald-500'
            }`}
            style={{ width: `${alert.risk_score}%` }}
          />
        </div>
      </div>

      {/* Message */}
      <p className="text-white/80 text-xs leading-relaxed mb-3">{alert.alert_message}</p>

      {/* Bank info */}
      {alert.bank_name && (
        <p className="text-white/30 text-xs mb-3">via {alert.bank_name}</p>
      )}

      {/* Action: categorize */}
      {alert.needs_clarification && (
        <button
          onClick={() => onCategorize(alert)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs font-medium hover:bg-violet-500/30 transition-colors"
        >
          <MessageSquare size={12} />
          What did you spend this on?
        </button>
      )}
    </motion.div>
  )
}

export default function SMSAlertToast({ alerts, onDismiss, onCategorize }: SMSAlertToastProps) {
  // Show max 3 alerts at once
  const visible = alerts.slice(-3)

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {visible.map((alert) => (
          <div key={alert.sms_id} className="pointer-events-auto">
            <SMSAlertCard
              alert={alert}
              onDismiss={onDismiss}
              onCategorize={onCategorize}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}
