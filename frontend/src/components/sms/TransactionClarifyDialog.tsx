/**
 * TransactionClarifyDialog
 *
 * Modal that pops up when a high-risk or unclear expense is detected via SMS.
 * Asks the user: "What did you spend this ₹X on?"
 * Presents quick-select categories and a free-text description input.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, MessageCircleQuestion } from 'lucide-react'
import type { ClarificationNeededEvent } from '@/lib/useWebSocket'
import { formatCurrency } from '@/lib/utils'

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
  'Other': 'other',
}

export default function TransactionClarifyDialog({
  event,
  onConfirm,
  onDismiss,
}: TransactionClarifyDialogProps) {
  const [selectedLabel, setSelectedLabel] = useState<string>('')
  const [description, setDescription] = useState('')
  const [confirmedAs, setConfirmedAs] = useState<'expense' | 'income'>('expense')

  if (!event) return null

  const handleConfirm = () => {
    const category = CATEGORY_MAP[selectedLabel] ?? 'other'
    const desc = description.trim() || selectedLabel
    onConfirm(event.sms_id, category, desc, confirmedAs)
    setSelectedLabel('')
    setDescription('')
  }

  const handleDismiss = () => {
    onDismiss(event.sms_id)
    setSelectedLabel('')
    setDescription('')
  }

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
            <div className="bg-gray-900 border border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-violet-500/20">
                    <MessageCircleQuestion size={20} className="text-violet-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">What did you buy?</h3>
                    <p className="text-white/50 text-sm">Help us track your spending accurately</p>
                  </div>
                </div>
                <button
                  onClick={handleDismiss}
                  className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Transaction summary */}
              <div className="bg-white/5 rounded-2xl p-4 mb-5 border border-white/10">
                <p className="text-white/50 text-xs mb-1">Detected Transaction</p>
                <p className="text-white font-bold text-2xl">{formatCurrency(event.amount)}</p>
                {event.merchant && (
                  <p className="text-white/60 text-sm mt-0.5">
                    at <span className="text-white/80 font-medium">{event.merchant}</span>
                  </p>
                )}
                <p className="text-white/40 text-xs mt-2">{event.message}</p>
              </div>

              {/* Expense vs Income toggle */}
              <div className="flex gap-2 mb-4">
                {(['expense', 'income'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setConfirmedAs(type)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                      confirmedAs === type
                        ? type === 'expense'
                          ? 'bg-red-500/20 border-red-500/40 text-red-300'
                          : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : 'border-white/10 text-white/40 hover:border-white/20'
                    }`}
                  >
                    {type === 'expense' ? '💸 Expense' : '💰 Income'}
                  </button>
                ))}
              </div>

              {/* Category grid */}
              <p className="text-white/60 text-xs font-medium mb-2">Select Category</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {event.suggested_categories.map((label) => (
                  <button
                    key={label}
                    onClick={() => setSelectedLabel(label)}
                    className={`py-2 px-2 rounded-xl text-xs text-center border transition-all leading-tight ${
                      selectedLabel === label
                        ? 'bg-violet-500/30 border-violet-400 text-violet-200'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Description input */}
              <div className="mb-5">
                <label className="text-white/60 text-xs font-medium block mb-1.5">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={`e.g. Exam fee, Grocery, Doctor visit...`}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-violet-500/50"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleDismiss}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 text-sm hover:bg-white/5 transition-colors"
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
