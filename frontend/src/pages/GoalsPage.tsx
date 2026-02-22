import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Target, Calendar, Trash2, Sparkles, TrendingUp, PiggyBank, ArrowRight, Tag, TrendingDown, Minus, X, Clock, IndianRupee, BarChart3, ShieldCheck, Zap } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { formatCurrency, cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { useAppStore } from '@/store/useAppStore'
import type { SavingsGoal } from '@/types'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { differenceInDays, format, addMonths, addDays } from 'date-fns'
import { goalsApi } from '@/lib/api'
import toast from 'react-hot-toast'

const goalSchema = z.object({
  name: z.string().min(1, 'Required').max(50),
  target_amount: z.coerce.number().min(100, 'Min ₹100'),
  target_date: z.string().min(1, 'Required'),
  icon: z.string().min(1),
  monthly_contribution: z.coerce.number().min(0).optional(),
  track_product: z.string().max(200).optional(),
})

type GoalForm = z.infer<typeof goalSchema>

type ProductPriceInfo = {
  price: number | null
  currency: string
  note: string
  trend: string
  difference?: number
  loading?: boolean
}

const goalIcons = ['🏍️', '🚗', '📱', '💻', '🏠', '✈️', '💍', '📚', '🎮', '📷', '⌚', '🛡️', '🎨', '💼', '🏥', '🎉']

// Milestones for visual progress
const getMilestones = (target: number) => [
  { pct: 25, label: '25%', amount: target * 0.25 },
  { pct: 50, label: '50%', amount: target * 0.5 },
  { pct: 75, label: '75%', amount: target * 0.75 },
  { pct: 100, label: '100%', amount: target },
]

export default function GoalsPage() {
  const { t } = useTranslation()
  const { settings } = useAppStore()
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAddMoneyModal, setShowAddMoneyModal] = useState<string | null>(null)
  const [addAmount, setAddAmount] = useState('')
  const [priceCache, setPriceCache] = useState<Record<string, ProductPriceInfo>>({})
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null)

  // Fetch goals from API on mount
  useEffect(() => {
    loadGoals()
  }, [])

  const loadGoals = async () => {
    try {
      const data = await goalsApi.list()
      setGoals(data.goals || [])
    } catch (error) {
      console.error('Failed to load goals:', error)
      toast.error('Failed to load goals')
    } finally {
      // loading handled by component mount
    }
  }

  const fetchPrice = useCallback(async (goalId: string) => {
    setPriceCache(prev => ({ ...prev, [goalId]: { price: null, currency: 'INR', note: '', trend: 'unknown', loading: true } }))
    try {
      const data = await goalsApi.goalProductPrice(goalId)
      setPriceCache(prev => ({ ...prev, [goalId]: { ...data, loading: false } }))
    } catch {
      setPriceCache(prev => ({ ...prev, [goalId]: { price: null, currency: 'INR', note: 'Unavailable', trend: 'unknown', loading: false } }))
    }
  }, [])

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<GoalForm>({
    // @ts-expect-error - Zod v4 coerce type inference issue with RHF
    resolver: zodResolver(goalSchema),
    defaultValues: {
      icon: '🎯',
      target_date: format(addMonths(new Date(), 6), 'yyyy-MM-dd'),
    },
  })

  const selectedIcon = watch('icon')

  const onCreateGoal = async (data: GoalForm) => {
    try {
      await goalsApi.create({
        name: data.name,
        target_amount: data.target_amount,
        target_date: data.target_date,
        icon: data.icon,
        monthly_contribution: data.monthly_contribution || 0,
        track_product: data.track_product || null,
      })
      toast.success('Goal created!')
      setShowCreateModal(false)
      reset()
      loadGoals()
    } catch (error) {
      toast.error('Failed to create goal')
      console.error(error)
    }
  }

  const handleAddMoney = async (goalId: string) => {
    const amount = Number(addAmount)
    if (amount > 0) {
      try {
        await goalsApi.addMoney(goalId, amount)
        toast.success(`Added ${formatCurrency(amount)}!`)
        loadGoals()
      } catch (error) {
        toast.error('Failed to add money')
        console.error(error)
      }
    }
    setShowAddMoneyModal(null)
    setAddAmount('')
  }

  const deleteGoal = async (id: string) => {
    try {
      await goalsApi.delete(id)
      toast.success('Goal deleted')
      loadGoals()
    } catch (error) {
      toast.error('Failed to delete goal')
      console.error(error)
    }
  }

  const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0)
  const totalSaved = goals.reduce((s, g) => s + g.current_amount, 0)
  const overallProgress = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0

  return (
    <div className="space-y-6 max-w-5xl mx-auto px-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('goals_title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('goals_subtitle')}</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
          {t('goals_new')}
        </Button>
      </motion.div>

      {/* Overall Progress Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative overflow-hidden gradient-hero rounded-3xl p-6 md:p-8 text-white"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <p className="text-white/70 text-sm font-medium mb-1">{t('goals_total_progress')}</p>
              <p className="text-4xl font-bold">
                {formatCurrency(totalSaved)}
                <span className="text-lg font-normal text-white/60 ml-2">/ {formatCurrency(totalTarget)}</span>
              </p>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mb-2">
                  <Target className="w-8 h-8" />
                </div>
                <p className="text-2xl font-bold">{goals.length}</p>
                <p className="text-xs text-white/60">Goals</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mb-2">
                  <TrendingUp className="w-8 h-8" />
                </div>
                <p className="text-2xl font-bold">{overallProgress.toFixed(0)}%</p>
                <p className="text-xs text-white/60">{t('goals_complete')}</p>
              </div>
            </div>
          </div>

          {/* Progress Bar with Milestones */}
          <div className="mt-6 relative">
            <div className="bg-white/20 rounded-full h-4 overflow-hidden">
              <motion.div
                className="bg-white h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(overallProgress, 100)}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </div>
            {/* Milestone markers */}
            <div className="flex justify-between mt-2 px-1">
              {[0, 25, 50, 75, 100].map((pct) => (
                <div key={pct} className="text-center">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full mx-auto mb-1',
                      overallProgress >= pct ? 'bg-white' : 'bg-white/30'
                    )}
                  />
                  <span className={cn('text-xs', overallProgress >= pct ? 'text-white' : 'text-white/50')}>{pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Goal Cards */}
      {goals.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-gray-50 dark:bg-gray-800/40 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-12 text-center"
        >
          <Target className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">No goals yet. Create your first savings goal!</p>
          <Button onClick={() => setShowCreateModal(true)} icon={<Plus className="w-4 h-4" />}>
            {t('goals_new')}
          </Button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {goals.map((goal, i) => {
            const progress = (goal.current_amount / goal.target_amount) * 100
            const daysLeft = differenceInDays(new Date(goal.target_date), new Date())
            const monthsLeft = Math.ceil(daysLeft / 30)
            const remaining = goal.target_amount - goal.current_amount
            const monthlyNeeded = monthsLeft > 0 ? remaining / monthsLeft : remaining
            const isOnTrack = goal.monthly_contribution >= monthlyNeeded
            const milestones = getMilestones(goal.target_amount)
            const incomePercentage = settings.monthlyIncome > 0 ? (goal.monthly_contribution / settings.monthlyIncome) * 100 : 0

            return (
              <motion.div
                key={goal.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.08 }}
                className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/50 overflow-hidden hover:shadow-lg dark:hover:border-gray-600/50 transition-all duration-300 cursor-pointer"
                onClick={() => {
                  setSelectedGoal(goal.id)
                  if (goal.track_product && !priceCache[goal.id]) fetchPrice(goal.id)
                }}
              >
                {/* Header */}
                <div className="p-5 border-b border-gray-100 dark:border-gray-700/50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-primary-50 dark:bg-primary-500/10 flex items-center justify-center">
                        <span className="text-3xl">{goal.icon}</span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{goal.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span
                            className={cn(
                              'text-xs font-medium',
                              daysLeft > 30 ? 'text-gray-500' : daysLeft > 0 ? 'text-amber-600' : 'text-red-500'
                            )}
                          >
                            {daysLeft > 0 ? `${daysLeft} ${t('goals_days_left')}` : t('goals_overdue')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteGoal(goal.id)}
                      className="p-2 rounded-xl text-gray-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Progress Section */}
                <div className="p-5">
                  {/* Amount */}
                  <div className="flex items-end justify-between mb-3">
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(goal.current_amount)}</p>
                      <p className="text-sm text-gray-400 dark:text-gray-500">of {formatCurrency(goal.target_amount)}</p>
                    </div>
                    <span
                      className={cn(
                        'text-sm font-bold px-3 py-1 rounded-full',
                        progress >= 100
                          ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : progress >= 50
                          ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      )}
                    >
                      {progress.toFixed(0)}%
                    </span>
                  </div>

                  {/* Progress Bar with Milestone Dots */}
                  <div className="relative">
                    <div className="bg-gray-100 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                      <motion.div
                        className={cn('h-full rounded-full', progress >= 75 ? 'bg-emerald-500' : 'gradient-hero')}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(progress, 100)}%` }}
                        transition={{ duration: 0.8, delay: 0.2 + i * 0.08 }}
                      />
                    </div>
                    {/* Milestones */}
                    <div className="absolute top-0 left-0 right-0 h-3 flex items-center">
                      {milestones.slice(0, -1).map((m) => (
                        <div
                          key={m.pct}
                          style={{ left: `${m.pct}%` }}
                          className={cn(
                            'absolute w-3 h-3 rounded-full border-2 border-white transform -translate-x-1/2',
                            progress >= m.pct ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                          )}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t('goals_monthly')}</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(goal.monthly_contribution)}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t('goals_need_mo')}</p>
                      <p className={cn('text-lg font-bold', isOnTrack ? 'text-emerald-600' : 'text-amber-600')}>
                        {formatCurrency(monthlyNeeded)}
                      </p>
                    </div>
                  </div>

                  {/* AI Tip */}
                  {daysLeft > 0 && (
                    <div
                      className={cn(
                        'mt-4 rounded-xl p-3 flex items-start gap-2',
                        isOnTrack ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-amber-50 dark:bg-amber-500/10'
                      )}
                    >
                      <Sparkles className={cn('w-4 h-4 mt-0.5', isOnTrack ? 'text-emerald-500' : 'text-amber-500')} />
                      <div>
                        <p className={cn('text-xs font-medium', isOnTrack ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400')}>
                          {t('goals_ai_tip')}
                        </p>
                        <p className={cn('text-xs mt-0.5', isOnTrack ? 'text-emerald-600 dark:text-emerald-400/80' : 'text-amber-600 dark:text-amber-400/80')}>
                          {isOnTrack
                            ? t('goals_on_track')
                            : `${t('goals_increase')} ${formatCurrency(monthlyNeeded - goal.monthly_contribution)} ${t('goals_to_track')}`}
                        </p>
                        {incomePercentage > 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {incomePercentage.toFixed(1)}% {t('goals_percentage')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Track Product Price Widget */}
                  {goal.track_product && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium">
                          <Tag className="w-3.5 h-3.5" />
                          <span>{goal.track_product}</span>
                        </div>
                        <button
                          onClick={() => fetchPrice(goal.id)}
                          className="text-xs text-primary-600 hover:underline"
                        >
                          {priceCache[goal.id] ? 'Refresh' : 'Check price'}
                        </button>
                      </div>
                      <AnimatePresence>
                        {priceCache[goal.id] && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            {priceCache[goal.id].loading ? (
                              <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3 text-xs text-gray-400 text-center animate-pulse">Fetching price...</div>
                            ) : priceCache[goal.id].price ? (
                              <div className={cn(
                                'rounded-xl p-3 flex items-center justify-between',
                                (priceCache[goal.id].difference ?? 0) <= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-amber-50 dark:bg-amber-500/10'
                              )}>
                                <div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">{priceCache[goal.id].note}</p>
                                  <p className="text-lg font-bold text-gray-900 dark:text-white">₹{priceCache[goal.id].price!.toLocaleString('en-IN')}</p>
                                  {(priceCache[goal.id].difference ?? 0) <= 0 && (
                                    <p className="text-xs text-emerald-600 font-medium mt-0.5">🎉 Within your budget!</p>
                                  )}
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <span className={cn(
                                    'text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1',
                                    priceCache[goal.id].trend === 'falling'
                                      ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                      : priceCache[goal.id].trend === 'rising'
                                      ? 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400'
                                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                  )}>
                                    {priceCache[goal.id].trend === 'falling' ? <TrendingDown className="w-3 h-3" /> :
                                     priceCache[goal.id].trend === 'rising' ? <TrendingUp className="w-3 h-3" /> :
                                     <Minus className="w-3 h-3" />}
                                    {priceCache[goal.id].trend}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3 text-xs text-gray-400 text-center">{priceCache[goal.id].note || 'Price unavailable'}</div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Add Money Button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowAddMoneyModal(goal.id) }}
                    className="w-full mt-4 py-3 px-4 bg-primary-50 dark:bg-primary-500/10 hover:bg-primary-100 dark:hover:bg-primary-500/20 text-primary-700 dark:text-primary-400 font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
                  >
                    <PiggyBank className="w-4 h-4" />
                    {t('goals_add_money')}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Create Goal Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title={t('goals_create')}>
        {/* @ts-expect-error - Zod v4 coerce type inference issue with RHF */}
        <form onSubmit={handleSubmit(onCreateGoal)} className="space-y-5">
          {/* Icon Picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('goals_choose_icon')}</label>
            <div className="grid grid-cols-8 gap-2">
              {goalIcons.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setValue('icon', icon)}
                  className={cn(
                    'p-2 text-2xl rounded-xl border-2 transition-all text-center',
                    selectedIcon === icon
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/15 shadow-sm'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  )}
                >
                  {icon}
                </button>
              ))}
            </div>
            <input type="hidden" {...register('icon')} />
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('goals_name')}</label>
            <input
              {...register('name')}
              placeholder="e.g., New Bike"
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          {/* Target Amount + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('goals_target_amount')}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
                <input
                  type="number"
                  {...register('target_amount')}
                  placeholder="50,000"
                  className="w-full pl-8 pr-4 py-3 border border-gray-200 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>
              {errors.target_amount && <p className="text-xs text-red-500 mt-1">{errors.target_amount.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('goals_target_date')}</label>
              <input
                type="date"
                {...register('target_date')}
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>
          </div>

          {/* Monthly Contribution */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('goals_monthly_contrib')} (optional)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
              <input
                type="number"
                {...register('monthly_contribution')}
                placeholder="2,500"
                className="w-full pl-8 pr-4 py-3 border border-gray-200 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>
          </div>

          {/* Track Product */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <span className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-gray-400" />
                Track Product Price (optional)
              </span>
            </label>
            <input
              {...register('track_product')}
              placeholder="e.g., iPhone 15, MacBook Air M3"
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            <p className="text-xs text-gray-400 mt-1">We'll track current market price and alert you when it drops within your budget.</p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit">{t('save')}</Button>
          </div>
        </form>
      </Modal>

      {/* Add Money Modal */}
      <Modal
        isOpen={!!showAddMoneyModal}
        onClose={() => {
          setShowAddMoneyModal(null)
          setAddAmount('')
        }}
        title={t('goals_add_money')}
        size="sm"
      >
        <div className="space-y-4">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium text-lg">₹</span>
            <input
              type="number"
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-full pl-10 pr-4 py-4 border border-gray-200 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded-xl text-xl focus:outline-none focus:ring-2 focus:ring-primary-400"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[500, 1000, 2000, 5000].map((amt) => (
              <button
                key={amt}
                onClick={() => setAddAmount(String(amt))}
                className={cn(
                  'py-3 text-sm font-medium border-2 rounded-xl transition-all',
                  addAmount === String(amt)
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-400'
                    : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                )}
              >
                ₹{amt.toLocaleString('en-IN')}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddMoneyModal(null)
                setAddAmount('')
              }}
            >
              {t('cancel')}
            </Button>
            <Button onClick={() => showAddMoneyModal && handleAddMoney(showAddMoneyModal)}>{t('goals_add_money')}</Button>
          </div>
        </div>
      </Modal>

      {/* Goal Detail Slide-over */}
      <AnimatePresence>
        {selectedGoal && (() => {
          const goal = goals.find(g => g.id === selectedGoal)
          if (!goal) return null
          const progress = (goal.current_amount / goal.target_amount) * 100
          const daysLeft = differenceInDays(new Date(goal.target_date), new Date())
          const monthsLeft = Math.max(Math.ceil(daysLeft / 30), 1)
          const remaining = goal.target_amount - goal.current_amount
          const monthlyNeeded = monthsLeft > 0 ? remaining / monthsLeft : remaining
          const dailyNeeded = daysLeft > 0 ? remaining / daysLeft : remaining
          const isOnTrack = goal.monthly_contribution >= monthlyNeeded
          const price = priceCache[goal.id]
          const completionDate = goal.monthly_contribution > 0
            ? addDays(new Date(), Math.ceil(remaining / (goal.monthly_contribution / 30)))
            : null

          return (
            <motion.div
              key="goal-detail-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setSelectedGoal(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Detail Header */}
                <div className="relative overflow-hidden gradient-hero rounded-t-3xl p-6 text-white">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                          <span className="text-3xl">{goal.icon}</span>
                        </div>
                        <div>
                          <h2 className="text-xl font-bold">{goal.name}</h2>
                          <div className="flex items-center gap-2 text-white/70 text-sm mt-0.5">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{daysLeft > 0 ? `${daysLeft} days remaining` : 'Overdue'}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedGoal(null)}
                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Progress in header */}
                    <div className="flex items-end justify-between mb-3">
                      <div>
                        <p className="text-3xl font-bold">{formatCurrency(goal.current_amount)}</p>
                        <p className="text-sm text-white/60">of {formatCurrency(goal.target_amount)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold">{progress.toFixed(0)}%</p>
                        <p className="text-sm text-white/60">saved</p>
                      </div>
                    </div>
                    <div className="bg-white/20 rounded-full h-3 overflow-hidden">
                      <motion.div
                        className="bg-white h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(progress, 100)}%` }}
                        transition={{ duration: 0.8 }}
                      />
                    </div>
                  </div>
                </div>

                {/* Detail Body */}
                <div className="p-6 space-y-5">
                  {/* Key Metrics Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-violet-50 dark:bg-violet-500/10 rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center">
                          <IndianRupee className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                        </div>
                        <span className="text-xs font-medium text-violet-600 dark:text-violet-400">Remaining</span>
                      </div>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(remaining)}</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-500/10 rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                          <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Monthly Need</span>
                      </div>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(monthlyNeeded)}</p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                          <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Daily Need</span>
                      </div>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(Math.ceil(dailyNeeded))}</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-500/10 rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                          <BarChart3 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Your Monthly</span>
                      </div>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(goal.monthly_contribution)}</p>
                    </div>
                  </div>

                  {/* Completion Timeline */}
                  <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-4 border border-gray-100 dark:border-gray-700/50">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldCheck className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">Savings Timeline</h3>
                    </div>
                    {goal.monthly_contribution > 0 ? (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Estimated completion</span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {completionDate ? format(completionDate, 'MMM dd, yyyy') : '—'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-500 dark:text-gray-400">At current rate</span>
                          <span className={cn(
                            'text-sm font-semibold',
                            isOnTrack ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                          )}>
                            {completionDate && daysLeft > 0
                              ? (differenceInDays(completionDate, new Date()) <= daysLeft ? '✅ On track' : `⚠️ ${Math.ceil(differenceInDays(completionDate, new Date()) / 30 - monthsLeft)} months behind`)
                              : '—'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Target date</span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {format(new Date(goal.target_date), 'MMM dd, yyyy')}
                          </span>
                        </div>
                        {!isOnTrack && (
                          <div className="mt-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                              💡 Increase monthly savings by <strong>{formatCurrency(monthlyNeeded - goal.monthly_contribution)}</strong> to reach your goal on time
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-gray-100 dark:bg-gray-700/50 text-center">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Set a monthly contribution to see your savings timeline</p>
                      </div>
                    )}
                  </div>

                  {/* Price Tracking Section (if product tracked) */}
                  {goal.track_product && (
                    <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-4 border border-gray-100 dark:border-gray-700/50">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Tag className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                          <h3 className="font-semibold text-gray-900 dark:text-white">Price Tracking</h3>
                        </div>
                        <button
                          onClick={() => fetchPrice(goal.id)}
                          className="text-xs px-3 py-1.5 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-500/20 font-medium transition-colors"
                        >
                          {price?.loading ? 'Checking...' : 'Refresh'}
                        </button>
                      </div>

                      <div className="text-xs text-gray-400 dark:text-gray-500 mb-3 truncate">{goal.track_product}</div>

                      {price?.loading ? (
                        <div className="animate-pulse space-y-3">
                          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-xl" />
                          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-lg w-2/3" />
                        </div>
                      ) : price?.price ? (
                        <div className="space-y-3">
                          {/* Current Price */}
                          <div className={cn(
                            'rounded-2xl p-4',
                            (price.difference ?? 0) <= 0
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20'
                              : 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20'
                          )}>
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{price.note || 'Current Price'}</p>
                                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">₹{price.price.toLocaleString('en-IN')}</p>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <span className={cn(
                                  'text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1',
                                  price.trend === 'falling'
                                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                                    : price.trend === 'rising'
                                    ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                )}>
                                  {price.trend === 'falling' ? <TrendingDown className="w-3 h-3" /> :
                                   price.trend === 'rising' ? <TrendingUp className="w-3 h-3" /> :
                                   <Minus className="w-3 h-3" />}
                                  {price.trend}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Price vs Budget Comparison */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="text-center p-3 rounded-xl bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/50">
                              <p className="text-xs text-gray-500 dark:text-gray-400">Your Budget</p>
                              <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(goal.target_amount)}</p>
                            </div>
                            <div className={cn(
                              'text-center p-3 rounded-xl border',
                              (price.difference ?? 0) <= 0
                                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20'
                                : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20'
                            )}>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Difference</p>
                              <p className={cn(
                                'text-lg font-bold',
                                (price.difference ?? 0) <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                              )}>
                                {(price.difference ?? 0) <= 0
                                  ? `${formatCurrency(Math.abs(price.difference ?? 0))} under`
                                  : `${formatCurrency(price.difference ?? 0)} over`}
                              </p>
                            </div>
                          </div>

                          {/* Days needed calculation */}
                          {(price.difference ?? 0) > 0 && goal.monthly_contribution > 0 && (
                            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
                              <div className="flex items-start gap-2">
                                <Clock className="w-4 h-4 text-blue-500 mt-0.5" />
                                <div>
                                  <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                                    You need {Math.ceil((price.price - goal.current_amount) / (goal.monthly_contribution / 30))} more days
                                  </p>
                                  <p className="text-xs text-blue-600 dark:text-blue-400/70 mt-0.5">
                                    At ₹{Math.round(goal.monthly_contribution / 30).toLocaleString('en-IN')}/day to afford this product
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {(price.difference ?? 0) <= 0 && (
                            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                              <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium text-center">
                                🎉 This product is within your budget!
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl bg-gray-100 dark:bg-gray-700/50 text-center">
                          <p className="text-sm text-gray-500 dark:text-gray-400">{price?.note || 'Click Refresh to check the current price'}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setSelectedGoal(null)
                        setShowAddMoneyModal(goal.id)
                      }}
                      className="flex-1 py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
                    >
                      <PiggyBank className="w-4 h-4" />
                      Add Money
                    </button>
                    <button
                      onClick={() => {
                        deleteGoal(goal.id)
                        setSelectedGoal(null)
                      }}
                      className="py-3 px-4 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}
