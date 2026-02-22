/**
 * TransactionClarifyDialog – AI-powered transaction clarification modal.
 *
 * • When the event has .ai_message (backend called Groq already) → uses it directly.
 * • Otherwise calls /api/sms/ai-classify to get Groq suggestions live.
 * • Shows Groq's conversational question as dialog title.
 * • Shows Groq's suggested categories as quick-select buttons.
 * • Shows Groq's spending insight as a small AI note.
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, MessageCircleQuestion, Sparkles, Brain } from 'lucide-react'
import type { ClarificationNeededEvent } from '@/lib/useWebSocket'
import { formatCurrency } from '@/lib/utils'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

interface TransactionClarifyDialogProps {
  event: ClarificationNeededEvent | null
  onConfirm: (
    smsId: string,
    category: string,
    description: string,
    confirmedAs: 'expense' | 'income' | 'ignore'
  ) => void
  onDismiss: (smsId: string) => void
}

// Map from display label to internal category key
const CATEGORY_MAP: Record<string, string> = {
  '🍕 Food / Dining': 'food',
  '🛒 Groceries': 'food',
  '🚗 Transport / Fuel': 'transport',
  '💊 Healthcare': 'healthcare',
  '📚 Education / Exam Fee': 'education',
  '💡 Utilities / Bills': 'utilities',
  '👗 Shopping / Clothes': 'shopping',
  '🎮 Entertainment': 'entertainment',
  '📱 Mobile Recharge': 'bills',
  '🏠 Rent / Maintenance': 'rent',
  '💰 Savings / Investment': 'other',
  '💸 Personal Transfer': 'other',
  '🔧 Services': 'other',
  'Other': 'other',
}

const DEFAULT_CATEGORIES = [
  '🍕 Food / Dining',
  '🛒 Groceries',
  '🚗 Transport / Fuel',
  '💊 Healthcare',
  '📚 Education / Exam Fee',
  '💡 Utilities / Bills',
  '👗 Shopping / Clothes',
  '🎮 Entertainment',
  '📱 Mobile Recharge',
  '🏠 Rent / Maintenance',
  '💰 Savings / Investment',
  'Other',
]

interface AIData {
  ai_message: string
  suggested_categories: string[]
  spending_insight: string
  ai_confidence: number
}

export default function TransactionClarifyDialog({
  event,
  onConfirm,
  onDismiss,
}: TransactionClarifyDialogProps) {
  const [selectedLabel, setSelectedLabel] = useState<string>('')
  const [description, setDescription] = useState('')
  const [confirmedAs, setConfirmedAs] = useState<'expense' | 'income'>('expense')
  const [aiData, setAiData] = useState<AIData | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  // Fetch AI suggestions when dialog opens (if backend did not pre-attach them)
  useEffect(() => {
    if (!event) {
      setAiData(null)
      setSelectedLabel('')
      setDescription('')
      return
    }

    // If backend already attached AI data, use it directly
    if (event.ai_message) {
      setAiData({
        ai_message: event.ai_message,
        suggested_categories: event.suggested_categories?.length
          ? event.suggested_categories
          : DEFAULT_CATEGORIES,
        spending_insight: event.spending_insight || '',
        ai_confidence: event.ai_confidence ?? 0.5,
      })
      return
    }

    // Otherwise call /api/sms/ai-classify live
    const fetchAI = async () => {
      setAiLoading(true)
      try {
        const token = localStorage.getItem('access_token') || ''
        const res = await fetch(`${API_BASE}/sms/ai-classify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sms_content: event.message,
            amount: event.amount,
            merchant: event.merchant,
            transaction_mode: 'UPI',
          }),
        })
        if (res.ok) {
          const data = await res.json()
          setAiData({
            ai_message: data.ai_message || `What did you spend ₹${event.amount.toFixed(0)} on?`,
            suggested_categories: data.suggested_categories?.length
              ? data.suggested_categories
              : event.suggested_categories?.length
              ? event.suggested_categories
              : DEFAULT_CATEGORIES,
            spending_insight: data.spending_insight || '',
            ai_confidence: data.confidence ?? 0.5,
          })
        } else {
          setAiData({
            ai_message: `What did you spend ${formatCurrency(event.amount)} on?`,
            suggested_categories: event.suggested_categories?.length
              ? event.suggested_categories
              : DEFAULT_CATEGORIES,
            spending_insight: '',
            ai_confidence: 0,
          })
        }
      } catch {
        setAiData({
          ai_message: `What did you spend ${formatCurrency(event.amount)} on?`,
          suggested_categories: event.suggested_categories?.length
            ? event.suggested_categories
            : DEFAULT_CATEGORIES,
          spending_insight: '',
          ai_confidence: 0,
        })
      } finally {
        setAiLoading(false)
      }
    }

    fetchAI()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.sms_id])

  if (!event) return null

  const handleConfirm = () => {
    const category = CATEGORY_MAP[selectedLabel] ?? 'other'
    const desc = description.trim() || selectedLabel
    onConfirm(event.sms_id, category, desc, confirmedAs)
    setSelectedLabel('')
    setDescription('')
    setAiData(null)
  }

  const handleDismiss = () => {
    onDismiss(event.sms_id)
    setSelectedLabel('')
    setDescription('')
    setAiData(null)
  }

  const categories = aiData?.suggested_categories ?? DEFAULT_CATEGORIES
  const dialogQuestion = aiData?.ai_message ?? `What did you spend ${formatCurrency(event.amount)} on?`
  const isAiPowered = !!(aiData?.ai_message) && !aiLoading

  return (
    <AnimatePresence>
      {event && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm"
            onClick={handleDismiss}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          >
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-violet-100 dark:bg-violet-500/20">
                    {isAiPowered
                      ? <Brain size={20} className="text-violet-600 dark:text-violet-400" />
                      : <MessageCircleQuestion size={20} className="text-violet-600 dark:text-violet-400" />
                    }
                  </div>
                  <div>
                    {aiLoading ? (
                      <>
                        <div className="h-4 w-36 bg-gray-200 dark:bg-white/10 rounded animate-pulse mb-1" />
                        <div className="h-3 w-24 bg-gray-100 dark:bg-white/5 rounded animate-pulse" />
                      </>
                    ) : (
                      <>
                        <h3 className="text-gray-900 dark:text-white font-bold text-base leading-tight max-w-[240px]">
                          {dialogQuestion}
                        </h3>
                        <p className="text-gray-400 dark:text-white/50 text-xs mt-0.5 flex items-center gap-1">
                          {isAiPowered && <Sparkles size={10} className="text-violet-500 dark:text-violet-400" />}
                          {isAiPowered ? 'AI-powered suggestion' : 'Help us track your spending'}
                        </p>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleDismiss}
                  className="p-1.5 rounded-xl text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Transaction summary */}
              <div className="bg-gray-50 dark:bg-white/5 rounded-2xl p-4 mb-4 border border-gray-200 dark:border-white/10">
                <p className="text-gray-500 dark:text-white/50 text-xs mb-1">Detected Transaction</p>
                <p className="text-gray-900 dark:text-white font-bold text-2xl">{formatCurrency(event.amount)}</p>
                {event.merchant && (
                  <p className="text-gray-500 dark:text-white/60 text-sm mt-0.5">
                    to <span className="text-gray-700 dark:text-white/80 font-medium">{event.merchant}</span>
                  </p>
                )}
              </div>

              {/* AI Spending insight */}
              {aiData?.spending_insight && (
                <div className="bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 rounded-xl px-4 py-2.5 mb-4 flex items-start gap-2">
                  <Sparkles size={14} className="text-violet-500 dark:text-violet-400 mt-0.5 shrink-0" />
                  <p className="text-violet-700 dark:text-violet-300 text-xs leading-relaxed">{aiData.spending_insight}</p>
                </div>
              )}

              {/* Expense vs Income toggle */}
              <div className="flex gap-2 mb-4">
                {(['expense', 'income'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setConfirmedAs(type)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                      confirmedAs === type
                        ? type === 'expense'
                          ? 'bg-red-50 dark:bg-red-500/20 border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-300'
                          : 'bg-emerald-50 dark:bg-emerald-500/20 border-emerald-300 dark:border-emerald-500/40 text-emerald-600 dark:text-emerald-300'
                        : 'border-gray-200 dark:border-white/10 text-gray-400 dark:text-white/40 hover:border-gray-300 dark:hover:border-white/20'
                    }`}
                  >
                    {type === 'expense' ? '💸 Expense' : '💰 Income'}
                  </button>
                ))}
              </div>

              {/* Category grid */}
              <p className="text-gray-500 dark:text-white/60 text-xs font-medium mb-2">
                {isAiPowered ? '✨ AI Suggested Categories' : 'Select Category'}
              </p>

              {aiLoading ? (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-9 rounded-xl bg-gray-100 dark:bg-white/5 animate-pulse border border-gray-200 dark:border-white/5" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {categories.map((label) => (
                    <button
                      key={label}
                      onClick={() => setSelectedLabel(label)}
                      className={`py-2 px-2 rounded-xl text-xs text-center border transition-all leading-tight ${
                        selectedLabel === label
                          ? 'bg-violet-100 dark:bg-violet-500/30 border-violet-400 text-violet-700 dark:text-violet-200'
                          : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* Description input */}
              <div className="mb-5">
                <label className="text-gray-500 dark:text-white/60 text-xs font-medium block mb-1.5">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Exam fee, Grocery, Doctor visit..."
                  className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-violet-500/50"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleDismiss}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/50 text-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!selectedLabel}
                  className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <Check size={14} />
                  Confirm
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
