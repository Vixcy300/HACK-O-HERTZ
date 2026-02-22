/**
 * SMSAlertToast — compact live-alert card, theme-aware.
 *
 * Shows the latest transaction in a slim card (bottom-right).
 * Credits → premium income card (green, no risk bar).
 * Debits  → risk-scored card with alert + "spend on?" action.
 * One card at a time; navigate with arrows if multiple are queued.
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
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Sparkles,
  ArrowDownLeft,
} from 'lucide-react'
import type { SMSAlertEvent } from '@/lib/useWebSocket'
import { formatCurrency } from '@/lib/utils'

interface SMSAlertToastProps {
  alerts: SMSAlertEvent[]
  onDismiss: (smsId: string) => void
  onCategorize: (alert: SMSAlertEvent) => void
}

// Theme-aware risk config — no hardcoded dark backgrounds
const RISK_CONFIG = {
  safe: {
    border: 'border-emerald-200 dark:border-emerald-500/30',
    badge: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500',
    stripe: 'bg-emerald-500',
    icon: ShieldCheck,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    label: 'Safe',
  },
  warning: {
    border: 'border-yellow-300 dark:border-yellow-500/30',
    badge: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-300',
    bar: 'bg-yellow-500',
    stripe: 'bg-yellow-500',
    icon: AlertTriangle,
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    label: 'Watch Out',
  },
  high_risk: {
    border: 'border-orange-300 dark:border-orange-500/30',
    badge: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300',
    bar: 'bg-orange-500',
    stripe: 'bg-orange-500',
    icon: ShieldAlert,
    iconColor: 'text-orange-600 dark:text-orange-400',
    label: 'High Risk',
  },
  critical: {
    border: 'border-red-300 dark:border-red-500/30',
    badge: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',
    bar: 'bg-red-500',
    stripe: 'bg-red-500',
    icon: Zap,
    iconColor: 'text-red-600 dark:text-red-400',
    label: 'Critical',
  },
}

export default function SMSAlertToast({ alerts, onDismiss, onCategorize }: SMSAlertToastProps) {
  const [idx, setIdx] = useState(0)

  const total = alerts.length
  if (total === 0) return null

  // Newest alert first
  const safeIdx = Math.min(idx, total - 1)
  const alert = alerts[total - 1 - safeIdx]
  const isCredit = alert.transaction_type === 'credit'

  // ── INCOME CARD (credits) ─────────────────────────────────────────────
  if (isCredit) {
    return (
      <div className="fixed bottom-5 right-5 z-[9999] w-72">
        <AnimatePresence mode="wait">
          <motion.div
            key={alert.sms_id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 shadow-lg shadow-emerald-500/10 bg-white dark:bg-[#0d1f17]"
          >
            {/* Green top stripe */}
            <div className="h-1 rounded-t-2xl bg-gradient-to-r from-emerald-400 to-teal-500" />

            <div className="p-3.5">
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center flex-shrink-0 shadow-sm shadow-emerald-500/30">
                    <ArrowDownLeft size={16} className="text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                        <Sparkles size={9} />
                        Money Received
                      </span>
                      {alert.transaction_mode && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{alert.transaction_mode}</span>
                      )}
                    </div>
                    <p className="font-bold text-lg leading-snug mt-0.5 text-emerald-600 dark:text-emerald-400">
                      +{formatCurrency(alert.amount)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onDismiss(alert.sms_id)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>

              {/* Source info */}
              {(alert.merchant || alert.bank_name) && (
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp size={11} className="text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                  <p className="text-emerald-700/80 dark:text-emerald-400/80 text-[11px] truncate">
                    {[alert.merchant, alert.bank_name].filter(Boolean).join(' · ')}
                  </p>
                </div>
              )}

              {/* Message */}
              <p className="text-gray-600 dark:text-emerald-200/70 text-[11px] leading-relaxed line-clamp-2 bg-emerald-50/60 dark:bg-emerald-900/20 rounded-xl px-2.5 py-1.5 border border-emerald-100 dark:border-emerald-500/20">
                {alert.alert_message}
              </p>

              {/* Navigation for multiple */}
              {total > 1 && (
                <div className="flex items-center gap-0.5 justify-end mt-2">
                  <button
                    disabled={safeIdx === total - 1}
                    onClick={() => setIdx(i => Math.min(i + 1, total - 1))}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium w-8 text-center">
                    {safeIdx + 1}/{total}
                  </span>
                  <button
                    disabled={safeIdx === 0}
                    onClick={() => setIdx(i => Math.max(i - 1, 0))}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    )
  }

  // ── DEBIT / EXPENSE RISK CARD ─────────────────────────────────────────
  const config = RISK_CONFIG[alert.risk_level as keyof typeof RISK_CONFIG] ?? RISK_CONFIG.warning
  const RiskIcon = config.icon

  return (
    <div className="fixed bottom-5 right-5 z-[9999] w-72">
      <AnimatePresence mode="wait">
        <motion.div
          key={alert.sms_id}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          className={`rounded-2xl border shadow-lg bg-white dark:bg-[#1a1d27] ${config.border}`}
        >
          {/* Colored top stripe */}
          <div className={`h-1 rounded-t-2xl ${config.stripe}`} />

          <div className="p-3.5">
            {/* Header row */}
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-500/15 flex items-center justify-center flex-shrink-0">
                  <TrendingDown size={15} className="text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${config.badge}`}>
                      {config.label}
                    </span>
                    {alert.transaction_mode && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">{alert.transaction_mode}</span>
                    )}
                  </div>
                  <p className="font-bold text-base leading-snug mt-0.5 text-red-600 dark:text-red-400">
                    -{formatCurrency(alert.amount)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <RiskIcon size={14} className={config.iconColor} />
                <button
                  onClick={() => onDismiss(alert.sms_id)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Merchant + bank */}
            {(alert.merchant || alert.bank_name) && (
              <p className="text-gray-500 dark:text-gray-400 text-[11px] truncate mb-2">
                {[alert.merchant, alert.bank_name].filter(Boolean).join(' · ')}
              </p>
            )}

            {/* Risk bar */}
            <div className="mb-2.5">
              <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mb-1">
                <span>Risk score</span>
                <span>{alert.risk_score.toFixed(0)}/100</span>
              </div>
              <div className="h-1 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${alert.risk_score}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className={`h-full rounded-full ${config.bar}`}
                />
              </div>
            </div>

            {/* Alert message */}
            <p className="text-gray-600 dark:text-gray-300 text-[11px] leading-relaxed mb-3 line-clamp-2">
              {alert.alert_message}
            </p>

            {/* Footer */}
            <div className="flex items-center gap-2">
              {alert.needs_clarification && (
                <button
                  onClick={() => onCategorize(alert)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-500/15 border border-violet-200 dark:border-violet-500/30 text-violet-700 dark:text-violet-300 text-[11px] font-medium hover:bg-violet-100 dark:hover:bg-violet-500/25 transition-colors"
                >
                  <MessageSquare size={11} />
                  What did you spend on?
                </button>
              )}

              {total > 1 && (
                <div className="flex items-center gap-0.5 ml-auto">
                  <button
                    disabled={safeIdx === total - 1}
                    onClick={() => setIdx(i => Math.min(i + 1, total - 1))}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium w-8 text-center">
                    {safeIdx + 1}/{total}
                  </span>
                  <button
                    disabled={safeIdx === 0}
                    onClick={() => setIdx(i => Math.max(i - 1, 0))}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
