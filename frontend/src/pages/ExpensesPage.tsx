import { useState, useMemo, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, ShieldAlert, Brain, AlertTriangle, TrendingDown, RefreshCw, Trash2, Edit3, Save } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { formatCurrency, getCategoryIcon, cn } from '@/lib/utils'
import SpendingDonut from '@/components/dashboard/SpendingDonut'
import type { Expense, ExpenseCategory, OverspendingAlert } from '@/types'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { expenseApi, analyticsApi } from '@/lib/api'
import { useNotifications } from '@/lib/useNotifications'
import { useWebSocket } from '@/lib/useWebSocket'
import { useTranslation } from '@/lib/i18n'
import { useAppStore, type CategoryLimits } from '@/store/useAppStore'
import toast from 'react-hot-toast'

const expenseSchema = z.object({
  amount: z.coerce.number().min(1, 'Min ₹1'),
  category: z.enum(['rent', 'food', 'transport', 'utilities', 'entertainment', 'healthcare', 'education', 'shopping', 'bills', 'other']),
  date: z.string().min(1, 'Required'),
  description: z.string().max(200).optional(),
  payment_method: z.enum(['cash', 'card', 'upi']),
})

type ExpenseForm = {
  amount: number
  category: 'rent' | 'food' | 'transport' | 'utilities' | 'entertainment' | 'healthcare' | 'education' | 'shopping' | 'bills' | 'other'
  date: string
  description?: string
  payment_method: 'cash' | 'card' | 'upi'
}

const expenseCategories: { value: ExpenseCategory; label: string }[] = [
  { value: 'rent', label: 'Rent' },
  { value: 'food', label: 'Food' },
  { value: 'transport', label: 'Transport' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education', label: 'Education' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'bills', label: 'Bills' },
  { value: 'other', label: 'Other' },
]

// Spending limits based on income
function checkOverspending(expense: { amount: number; category: string }, avgMonthlyIncome: number, currentSpending: Record<string, number>): OverspendingAlert | null {
  const limits: Record<string, number> = avgMonthlyIncome < 25000
    ? { rent: 0.30, food: 0.20, transport: 0.10, utilities: 0.10, entertainment: 0.10, healthcare: 0.05, education: 0.05, shopping: 0.15, bills: 0.15, other: 0.05 }
    : { rent: 0.25, food: 0.15, transport: 0.10, utilities: 0.10, entertainment: 0.15, healthcare: 0.05, education: 0.05, shopping: 0.20, bills: 0.10, other: 0.05 }

  // Check single purchase > 40%
  if (expense.amount > avgMonthlyIncome * 0.4) {
    return {
      alert_type: 'HIGH_VALUE_PURCHASE',
      severity: 'HIGH',
      message: `This ₹${expense.amount.toLocaleString('en-IN')} purchase is ${Math.round((expense.amount / avgMonthlyIncome) * 100)}% of your monthly income (₹${avgMonthlyIncome.toLocaleString('en-IN')}). This may impact your savings goals.`,
      recommendation: `Consider if this is essential. You could save this amount and reach your goals faster.`,
    }
  }

  const categoryTotal = (currentSpending[expense.category] || 0) + expense.amount
  const categoryLimit = avgMonthlyIncome * (limits[expense.category] || 0.05)
  if (categoryTotal > categoryLimit) {
    return {
      alert_type: 'CATEGORY_OVERSPENDING',
      severity: 'MEDIUM',
      message: `Your ${expense.category} spending this month is ₹${categoryTotal.toLocaleString('en-IN')} (${Math.round((categoryTotal / avgMonthlyIncome) * 100)}% of income). Recommended: ₹${Math.round(categoryLimit).toLocaleString('en-IN')} (${Math.round((limits[expense.category] || 5) * 100)}%).`,
      recommendation: `You've exceeded the ${expense.category} budget by ₹${Math.round(categoryTotal - categoryLimit).toLocaleString('en-IN')}. Consider reducing expenses.`,
    }
  }

  const totalSpending = Object.values(currentSpending).reduce((a, b) => a + b, 0) + expense.amount
  if (totalSpending > avgMonthlyIncome * 0.8) {
    return {
      alert_type: 'OVERALL_OVERSPENDING',
      severity: 'HIGH',
      message: `You've spent ₹${totalSpending.toLocaleString('en-IN')} this month (${Math.round((totalSpending / avgMonthlyIncome) * 100)}% of income). This leaves only ₹${Math.round(avgMonthlyIncome - totalSpending).toLocaleString('en-IN')} for savings.`,
      recommendation: 'Your savings target is at risk. Consider pausing non-essential spending.',
    }
  }

  return null
}

// Dirty expense categories (non-essential spending)
const DIRTY_CATEGORIES: ExpenseCategory[] = ['entertainment', 'shopping']
const DIRTY_THRESHOLD_PCT = 0.3 // If single expense > 30% of income = dirty

export default function ExpensesPage() {
  const { t } = useTranslation()
  const { settings, updateSettings } = useAppStore()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [alert, setAlert] = useState<OverspendingAlert | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState<{ is_dirty_expense?: boolean; save_instead?: number; impact_on_goals?: string } | null>(null)
  const [pendingExpense, setPendingExpense] = useState<ExpenseForm | null>(null)
  const [spendingBreakdown, setSpendingBreakdown] = useState<any[]>([])
  const { showLocalNotification } = useNotifications()
  
  // Spending limits edit state
  const [showLimitsModal, setShowLimitsModal] = useState(false)
  const [editLimits, setEditLimits] = useState<CategoryLimits>(settings.categoryLimits)

  const avgMonthlyIncome = settings.monthlyIncome || 28900

  // Fetch expenses from API
  const fetchExpenses = useCallback(async () => {
    try {
      setLoading(true)
      const [expData, breakdownData] = await Promise.all([
        expenseApi.list(),
        analyticsApi.spendingBreakdown().catch(() => ({ data: [] }))
      ])
      setExpenses(expData.expenses || [])
      setSpendingBreakdown(breakdownData.data || [])
    } catch (err) {
      console.error('Failed to fetch expenses:', err)
      toast.error('Failed to load expense data')
    } finally {
      setLoading(false)
    }
  }, [])

  // Refresh automatically when an SMS expense is added in real-time
  useWebSocket({ onExpenseAdded: fetchExpenses })

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  const handleDeleteExpense = async (id: string) => {
    try {
      setDeleting(id)
      await expenseApi.delete(id)
      setExpenses(expenses.filter((e) => e.id !== id))
      toast.success('Expense deleted')
    } catch (err) {
      toast.error('Failed to delete expense')
      fetchExpenses()
    } finally {
      setDeleting(null)
    }
  }

  // Calculate category spending and detect dirty expenses inline
  const { currentSpending, categoryLimits } = useMemo(() => {
    const spending = expenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount
      return acc
    }, {} as Record<string, number>)

    // Use stored limits from settings
    return { currentSpending: spending, categoryLimits: settings.categoryLimits }
  }, [expenses, settings.categoryLimits])

  // Check if an expense is "dirty" (non-essential or high value) with income-aware messaging
  const isDirtyExpense = (expense: Expense): { isDirty: boolean; reason?: string; saveMessage?: string } => {
    const incomePct = Math.round((expense.amount / avgMonthlyIncome) * 100)
    
    // High-value single purchase
    if (expense.amount > avgMonthlyIncome * DIRTY_THRESHOLD_PCT) {
      return { 
        isDirty: true, 
        reason: `${incomePct}% of your ₹${avgMonthlyIncome.toLocaleString('en-IN')} income!`,
        saveMessage: `With your income of ₹${avgMonthlyIncome.toLocaleString('en-IN')}, save this ₹${expense.amount.toLocaleString('en-IN')} instead!`
      }
    }
    // Non-essential category
    if (DIRTY_CATEGORIES.includes(expense.category)) {
      return { 
        isDirty: true, 
        reason: t('exp_dirty_non_essential'),
        saveMessage: `Low income alert: Invest ₹${expense.amount.toLocaleString('en-IN')} instead of ${expense.category}`
      }
    }
    return { isDirty: false }
  }

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<ExpenseForm>({
    // @ts-expect-error - Zod v4 coerce type inference mismatch with RHF resolver
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      category: 'food',
      payment_method: 'upi',
    },
  })

  const handleAddExpense = async (data: ExpenseForm) => {
    try {
      // Call backend AI-powered overspending check
      const result = await expenseApi.checkOverspending({
        amount: data.amount,
        category: data.category,
        description: data.description,
        monthly_income: avgMonthlyIncome,
      })

      if (result.alerts?.length > 0) {
        const topAlert = result.alerts[0]
        setAlert({
          alert_type: topAlert.type || 'AI_ALERT',
          severity: topAlert.severity === 'danger' ? 'HIGH' : 'MEDIUM',
          message: topAlert.message,
          recommendation: topAlert.suggestion || topAlert.impact_on_goals || 'Consider if this expense is really necessary.',
        })
        setAiAnalysis(result.ai_analysis || null)
        setPendingExpense(data)

        // Show push notification for dirty expenses
        if (result.ai_analysis?.is_dirty_expense) {
          showLocalNotification(
            '🛑 Dirty Expense Alert!',
            `₹${data.amount} on ${data.category} - ${result.ai_analysis.message || 'This is a non-essential expense!'}`,
            { url: '/expenses' }
          )
        }
        return
      }
    } catch {
      // Fallback to local check if backend fails
      const overspendAlert = checkOverspending({ amount: data.amount, category: data.category }, avgMonthlyIncome, currentSpending)
      if (overspendAlert) {
        setAlert(overspendAlert)
        setPendingExpense(data)
        return
      }
    }
    saveExpense(data)
  }

  const saveExpense = async (data: ExpenseForm) => {
    try {
      const result = await expenseApi.create({
        amount: data.amount,
        date: data.date,
        category: data.category,
        description: data.description || '',
        payment_method: data.payment_method,
      })
      if (result.expense) {
        setExpenses([result.expense, ...expenses])
        toast.success('Expense added')
      } else {
        fetchExpenses()
      }
    } catch (err) {
      toast.error('Failed to add expense')
      fetchExpenses()
    }
    setShowAddModal(false)
    setAlert(null)
    setPendingExpense(null)
    reset()
  }

  const selectedCategory = watch('category')
  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{t('exp_title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('exp_subtitle', { total: formatCurrency(totalSpent) })}</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            icon={<RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />} 
            onClick={fetchExpenses}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
            {t('exp_add')}
          </Button>
        </div>
      </div>

      {/* Category Spending Limits */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center shadow-sm">
              <TrendingDown className="w-4 h-4 text-white" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{t('exp_category_limits')}</h3>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              setEditLimits(settings.categoryLimits)
              setShowLimitsModal(true)
            }}
            className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700/50 text-xs font-semibold rounded-lg transition-all"
          >
            <Edit3 className="w-3 h-3" />
            Edit Limits
          </motion.button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
          {expenseCategories.map((cat, index) => {
            const spent = currentSpending[cat.value] || 0
            const limit = categoryLimits[cat.value as keyof CategoryLimits] || 500
            const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0
            const isOver = pct >= 100
            return (
              <motion.div 
                key={cat.value} 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="flex flex-col items-center gap-1 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-700"
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center text-base',
                  isOver ? 'bg-red-100 dark:bg-red-900/30' : pct > 70 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'
                )}>
                  {getCategoryIcon(cat.value)}
                </div>
                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300 text-center leading-tight">{cat.label}</span>
                <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className={cn('h-full rounded-full', isOver ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-emerald-400')}
                  />
                </div>
                <p className={cn('text-[10px] font-medium', isOver ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400')}>
                  {formatCurrency(spent)}
                </p>
              </motion.div>
            )
          })}
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-lg">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-r from-red-500 to-pink-500 flex items-center justify-center text-white text-xs">📊</span>
            {t('exp_recent')}
          </h3>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            <AnimatePresence>
            {expenses.slice(0, 8).map((exp, index) => {
              const dirty = isDirtyExpense(exp)
              return (
                <motion.div 
                  key={exp.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: index * 0.04 }}
                  className="py-2.5 px-1 group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0',
                        dirty.isDirty ? 'bg-red-100 dark:bg-red-900/40' : 'bg-gray-100 dark:bg-gray-700'
                      )}>
                        {getCategoryIcon(exp.category)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{exp.description || exp.category}</p>
                          {dirty.isDirty && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-[10px] font-bold rounded-md border border-red-200 dark:border-red-700/50">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              DIRTY
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {exp.payment_method.toUpperCase()}
                          {dirty.isDirty && dirty.reason && <span className="text-red-500 dark:text-red-400 ml-1">· {dirty.reason}</span>}
                        </p>
                        {dirty.isDirty && dirty.saveMessage && (
                          <p className="text-[11px] text-orange-600 dark:text-orange-400 mt-0.5 flex items-center gap-1">
                            💡 {dirty.saveMessage}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn('text-sm font-bold', dirty.isDirty ? 'text-red-600 dark:text-red-400' : 'text-red-500 dark:text-red-400')}>
                        -{formatCurrency(exp.amount)}
                      </span>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleDeleteExpense(exp.id)}
                        disabled={deleting === exp.id}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                      >
                        {deleting === exp.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
            </AnimatePresence>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center text-white text-sm">🍩</span>
            {t('exp_this_month')}
          </h3>
          <SpendingDonut data={spendingBreakdown.length > 0 ? spendingBreakdown : []} />
        </div>
      </div>

      {/* Add Expense Modal */}
      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); setAlert(null); setPendingExpense(null) }} title={t('exp_add')}>
        {/* @ts-expect-error Zod v4 coerce type mismatch */}
        <form onSubmit={handleSubmit(handleAddExpense)} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('exp_amount')}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₹</span>
              <input
                type="number"
                {...register('amount', { valueAsNumber: true })}
                placeholder="500"
                className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            {errors.amount && <p className="text-xs text-danger-500 mt-1">{errors.amount.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('exp_category')}</label>
            <div className="grid grid-cols-3 gap-2">
              {expenseCategories.map((cat) => (
                <label
                  key={cat.value}
                  className={cn(
                    'flex flex-col items-center gap-1 p-3 rounded-xl border cursor-pointer transition-all text-center',
                    selectedCategory === cat.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <input type="radio" value={cat.value} {...register('category')} className="sr-only" />
                  <span className="text-xl">{getCategoryIcon(cat.value)}</span>
                  <span className="text-xs font-medium">{cat.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('exp_date')}</label>
            <input type="date" {...register('date')} max={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('exp_description')}</label>
            <input type="text" {...register('description')} placeholder={t('exp_description_placeholder')}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('exp_payment')}</label>
            <div className="flex gap-3">
              {(['upi', 'card', 'cash'] as const).map((m) => (
                <label key={m}
                  className={cn(
                    'flex-1 text-center py-2 rounded-lg border cursor-pointer text-sm font-medium transition-all',
                    watch('payment_method') === m ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-200 text-gray-600'
                  )}>
                  <input type="radio" value={m} {...register('payment_method')} className="sr-only" />
                  {m.toUpperCase()}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>{t('cancel')}</Button>
            <Button type="submit">{t('exp_add')}</Button>
          </div>
        </form>
      </Modal>

      {/* Overspending Alert Modal */}
      <AnimatePresence>
        {alert && (
          <Modal isOpen={!!alert} onClose={() => { setAlert(null); setPendingExpense(null); setAiAnalysis(null) }} title={`⚠️ ${t('exp_alert_title')}`} size="md">
            <div className="space-y-4">
              <div className={cn(
                'p-4 rounded-xl border',
                alert.severity === 'HIGH' ? 'bg-danger-50 border-danger-500/20' : 'bg-warning-50 border-warning-500/20'
              )}>
                <div className="flex items-start gap-3">
                  <ShieldAlert className={cn('w-6 h-6 flex-shrink-0', alert.severity === 'HIGH' ? 'text-danger-500' : 'text-warning-500')} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{alert.message}</p>
                    <p className="text-sm text-gray-600 mt-2">💡 {alert.recommendation}</p>
                  </div>
                </div>
              </div>

              {/* AI Analysis Details */}
              {aiAnalysis && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-semibold text-blue-800">{t('exp_ai_analysis')}</span>
                  </div>
                  {aiAnalysis.is_dirty_expense && (
                    <p className="text-sm text-red-600 font-medium mb-1">🚫 {t('exp_dirty_expense_label')}</p>
                  )}
                  {aiAnalysis.save_instead != null && aiAnalysis.save_instead > 0 && (
                    <p className="text-sm text-gray-700">💰 {t('exp_save_instead', { amount: formatCurrency(aiAnalysis.save_instead) })}</p>
                  )}
                  {aiAnalysis.impact_on_goals && (
                    <p className="text-sm text-gray-700 mt-1">🎯 {aiAnalysis.impact_on_goals}</p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => { setAlert(null); setPendingExpense(null); setAiAnalysis(null) }}>{t('exp_cancel_purchase')}</Button>
                <Button variant="secondary" onClick={() => { if (pendingExpense) saveExpense(pendingExpense) }}>{t('exp_save_anyway')}</Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Edit Spending Limits Modal */}
      <AnimatePresence>
        {showLimitsModal && (
          <Modal
            isOpen={showLimitsModal}
            onClose={() => setShowLimitsModal(false)}
            title="Edit Category Spending Limits"
            size="lg"
          >
            <div className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">
                Set monthly spending limits for each category. You'll get alerts when you exceed these limits.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {expenseCategories.map((cat) => (
                  <div key={cat.value} className="flex items-center gap-3">
                    <span className="text-xl">{getCategoryIcon(cat.value)}</span>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">{cat.label}</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                        <input
                          type="number"
                          value={editLimits[cat.value as keyof CategoryLimits] || 0}
                          onChange={(e) => setEditLimits({
                            ...editLimits,
                            [cat.value]: Number(e.target.value)
                          })}
                          className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                          min={0}
                          step={100}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <Button variant="outline" onClick={() => setShowLimitsModal(false)}>
                  Cancel
                </Button>
                <Button
                  icon={<Save className="w-4 h-4" />}
                  onClick={() => {
                    updateSettings({ categoryLimits: editLimits })
                    setShowLimitsModal(false)
                    toast.success('Spending limits updated!')
                  }}
                >
                  Save Limits
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  )
}
