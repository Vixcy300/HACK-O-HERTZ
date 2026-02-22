import type { Income, Expense, SavingsRule, SavingsGoal, DashboardMetrics, AIInsight, VolatilityData, InvestmentRecommendation } from '@/types'

// ──── Mock Incomes (3 months of gig worker data) ────
export const mockIncomes: Income[] = [
  { id: '1', user_id: 'u1', source_id: 's1', source_name: 'Upwork', amount: 12500, date: '2026-02-10', description: 'Logo design project', category: 'freelance', tags: ['#design'], created_at: '2026-02-10T10:00:00Z' },
  { id: '2', user_id: 'u1', source_id: 's2', source_name: 'Swiggy', amount: 3200, date: '2026-02-08', description: 'Weekend deliveries', category: 'delivery', tags: [], created_at: '2026-02-08T18:00:00Z' },
  { id: '3', user_id: 'u1', source_id: 's3', source_name: 'YouTube', amount: 4800, date: '2026-02-05', description: 'AdSense February payout', category: 'content', tags: ['#adsense'], created_at: '2026-02-05T12:00:00Z' },
  { id: '4', user_id: 'u1', source_id: 's1', source_name: 'Upwork', amount: 8400, date: '2026-02-01', description: 'WordPress site development', category: 'freelance', tags: ['#wordpress'], created_at: '2026-02-01T09:00:00Z' },
  { id: '5', user_id: 'u1', source_id: 's4', source_name: 'Udemy', amount: 2100, date: '2026-01-28', description: 'Course sales January', category: 'tutoring', tags: ['#course'], created_at: '2026-01-28T14:00:00Z' },
  { id: '6', user_id: 'u1', source_id: 's2', source_name: 'Swiggy', amount: 2800, date: '2026-01-25', description: 'Weekday deliveries', category: 'delivery', tags: [], created_at: '2026-01-25T20:00:00Z' },
  { id: '7', user_id: 'u1', source_id: 's1', source_name: 'Upwork', amount: 15000, date: '2026-01-20', description: 'E-commerce redesign', category: 'freelance', tags: ['#ecommerce'], created_at: '2026-01-20T11:00:00Z' },
  { id: '8', user_id: 'u1', source_id: 's3', source_name: 'YouTube', amount: 5200, date: '2026-01-15', description: 'AdSense January payout', category: 'content', tags: ['#adsense'], created_at: '2026-01-15T12:00:00Z' },
  { id: '9', user_id: 'u1', source_id: 's2', source_name: 'Swiggy', amount: 3500, date: '2026-01-10', description: 'Holiday week deliveries', category: 'delivery', tags: [], created_at: '2026-01-10T19:00:00Z' },
  { id: '10', user_id: 'u1', source_id: 's1', source_name: 'Upwork', amount: 9800, date: '2026-01-05', description: 'Mobile app UI design', category: 'freelance', tags: ['#mobile', '#design'], created_at: '2026-01-05T10:00:00Z' },
  { id: '11', user_id: 'u1', source_id: 's5', source_name: 'Meesho', amount: 1800, date: '2026-01-02', description: 'Product sales December', category: 'ecommerce', tags: [], created_at: '2026-01-02T08:00:00Z' },
  { id: '12', user_id: 'u1', source_id: 's1', source_name: 'Upwork', amount: 11000, date: '2025-12-22', description: 'Dashboard redesign', category: 'freelance', tags: ['#dashboard'], created_at: '2025-12-22T10:00:00Z' },
  { id: '13', user_id: 'u1', source_id: 's3', source_name: 'YouTube', amount: 3900, date: '2025-12-18', description: 'AdSense December payout', category: 'content', tags: ['#adsense'], created_at: '2025-12-18T12:00:00Z' },
  { id: '14', user_id: 'u1', source_id: 's2', source_name: 'Swiggy', amount: 4100, date: '2025-12-12', description: 'Festival week deliveries', category: 'delivery', tags: [], created_at: '2025-12-12T18:00:00Z' },
  { id: '15', user_id: 'u1', source_id: 's4', source_name: 'Udemy', amount: 3200, date: '2025-12-05', description: 'Course sales November', category: 'tutoring', tags: ['#course'], created_at: '2025-12-05T14:00:00Z' },
]

// ──── Mock Expenses ────
export const mockExpenses: Expense[] = [
  { id: 'e1', user_id: 'u1', amount: 450, date: '2026-02-12', category: 'food', description: 'Dinner at restaurant', payment_method: 'upi', created_at: '2026-02-12T20:00:00Z' },
  { id: 'e2', user_id: 'u1', amount: 200, date: '2026-02-11', category: 'transport', description: 'Auto rickshaw', payment_method: 'cash', created_at: '2026-02-11T09:00:00Z' },
  { id: 'e3', user_id: 'u1', amount: 1500, date: '2026-02-10', category: 'shopping', description: 'New keyboard', payment_method: 'card', created_at: '2026-02-10T15:00:00Z' },
  { id: 'e4', user_id: 'u1', amount: 800, date: '2026-02-09', category: 'bills', description: 'Electricity bill', payment_method: 'upi', created_at: '2026-02-09T10:00:00Z' },
  { id: 'e5', user_id: 'u1', amount: 350, date: '2026-02-08', category: 'food', description: 'Groceries', payment_method: 'upi', created_at: '2026-02-08T11:00:00Z' },
  { id: 'e6', user_id: 'u1', amount: 999, date: '2026-02-07', category: 'entertainment', description: 'Netflix annual plan', payment_method: 'card', created_at: '2026-02-07T14:00:00Z' },
  { id: 'e7', user_id: 'u1', amount: 150, date: '2026-02-06', category: 'transport', description: 'Metro card recharge', payment_method: 'upi', created_at: '2026-02-06T08:00:00Z' },
  { id: 'e8', user_id: 'u1', amount: 2500, date: '2026-02-05', category: 'bills', description: 'Mobile + Internet bill', payment_method: 'upi', created_at: '2026-02-05T12:00:00Z' },
  { id: 'e9', user_id: 'u1', amount: 600, date: '2026-02-03', category: 'food', description: 'Weekend ordering', payment_method: 'upi', created_at: '2026-02-03T19:00:00Z' },
  { id: 'e10', user_id: 'u1', amount: 3200, date: '2026-02-01', category: 'shopping', description: 'New shoes', payment_method: 'card', created_at: '2026-02-01T16:00:00Z' },
]

// ──── Mock Savings Rules ────
export const mockRules: SavingsRule[] = [
  {
    id: 'r1', user_id: 'u1', name: 'Freelance Power Saver',
    conditions: [{ field: 'amount', operator: 'gt', value: 1500 }, { field: 'category', operator: 'is', value: 'freelance' }],
    action: { type: 'save_percentage', value: 15, destination: 'Emergency Fund' },
    safety: { min_balance: 2000, min_monthly_income: 8000 },
    is_active: true, priority: 1, times_triggered: 12, total_saved: 8400, last_triggered: '2026-02-10T10:00:00Z', created_at: '2025-11-01T00:00:00Z',
  },
  {
    id: 'r2', user_id: 'u1', name: 'Delivery Bonus Stash',
    conditions: [{ field: 'amount', operator: 'gt', value: 1000 }, { field: 'category', operator: 'is', value: 'delivery' }],
    action: { type: 'save_fixed', value: 500, destination: 'New Bike Fund' },
    safety: { min_balance: 1000 },
    is_active: true, priority: 2, times_triggered: 8, total_saved: 4000, last_triggered: '2026-02-08T18:00:00Z', created_at: '2025-11-15T00:00:00Z',
  },
  {
    id: 'r3', user_id: 'u1', name: 'Content Creator Fund',
    conditions: [{ field: 'category', operator: 'is', value: 'content' }],
    action: { type: 'save_percentage', value: 20, destination: 'Camera Upgrade' },
    safety: { min_monthly_income: 10000, max_monthly_savings: 5000 },
    is_active: false, priority: 3, times_triggered: 5, total_saved: 2780, last_triggered: '2026-02-05T12:00:00Z', created_at: '2025-12-01T00:00:00Z',
  },
]

// ──── Mock Goals ────
export const mockGoals: SavingsGoal[] = [
  { id: 'g1', user_id: 'u1', name: 'Emergency Fund', target_amount: 50000, current_amount: 28400, target_date: '2026-06-30', icon: '🛡️', is_active: true, monthly_contribution: 3500, created_at: '2025-10-01T00:00:00Z' },
  { id: 'g2', user_id: 'u1', name: 'New Bike', target_amount: 85000, current_amount: 36000, target_date: '2026-12-31', icon: '🏍️', is_active: true, monthly_contribution: 5000, created_at: '2025-11-01T00:00:00Z' },
  { id: 'g3', user_id: 'u1', name: 'Camera Upgrade', target_amount: 35000, current_amount: 12800, target_date: '2026-09-15', icon: '📷', is_active: true, monthly_contribution: 2500, created_at: '2025-12-01T00:00:00Z' },
]

// ──── Mock Dashboard Metrics ────
export const mockDashboardMetrics: DashboardMetrics = {
  total_income_this_month: 28900,
  income_change_pct: 12.5,
  active_sources: 5,
  avg_daily_income: 2225,
  daily_income_change: 250,
  total_saved_this_month: 4200,
  savings_target: 10000,
}

// ──── Mock AI Insights ────
export const mockInsights: AIInsight[] = [
  {
    type: 'achievement',
    icon: '🎉',
    title: 'Great Week for Freelancing!',
    message: 'Your Upwork earnings jumped 48% this week. Keep landing those design projects!',
    action: 'Consider raising your hourly rate by 10%',
  },
  {
    type: 'warning',
    icon: '⚠️',
    title: 'Shopping Spending Up',
    message: 'You spent ₹4,700 on shopping this month — 35% more than your average. Watch out!',
    action: 'Set a ₹3,000 monthly shopping budget',
  },
  {
    type: 'tip',
    icon: '💡',
    title: 'Diversify Your Income',
    message: "67% of your income comes from Upwork. Adding 1 more source can reduce risk by 30%.",
    action: 'Try content writing on Medium or Substack',
  },
]

// ──── Mock Volatility ────
export const mockVolatility: VolatilityData = {
  score: 32.5,
  rating: 'medium',
  color: '#F59E0B',
  message: 'Moderate income fluctuations. Keep emergency fund ready.',
  mean_income: 24500,
  std_deviation: 7960,
}

// ──── Mock Income Chart Data ────
export const mockIncomeChartData = [
  { month: 'Sep 2025', freelance: 8500, delivery: 2200, content: 3100, tutoring: 1500, ecommerce: 800, total: 16100 },
  { month: 'Oct 2025', freelance: 12000, delivery: 3400, content: 3800, tutoring: 2000, ecommerce: 1200, total: 22400 },
  { month: 'Nov 2025', freelance: 14500, delivery: 2800, content: 4200, tutoring: 1800, ecommerce: 900, total: 24200 },
  { month: 'Dec 2025', freelance: 11000, delivery: 4100, content: 3900, tutoring: 3200, ecommerce: 1800, total: 24000 },
  { month: 'Jan 2026', freelance: 24800, delivery: 6300, content: 5200, tutoring: 2100, ecommerce: 1800, total: 40200 },
  { month: 'Feb 2026', freelance: 20900, delivery: 3200, content: 4800, tutoring: 0, ecommerce: 0, total: 28900 },
]

// ──── Mock Spending Breakdown ────
export const mockSpendingBreakdown = [
  { category: 'Food', amount: 1400, percentage: 14.3, color: '#F59E0B' },
  { category: 'Transport', amount: 350, percentage: 3.6, color: '#3B82F6' },
  { category: 'Entertainment', amount: 999, percentage: 10.2, color: '#EF4444' },
  { category: 'Shopping', amount: 4700, percentage: 48.0, color: '#10B981' },
  { category: 'Bills', amount: 3300, percentage: 33.7, color: '#6366F1' },
  { category: 'Other', amount: 0, percentage: 0, color: '#6B7280' },
]

// ──── Mock Investment Recommendation ────
export const mockInvestmentRecommendation: InvestmentRecommendation = {
  risk_profile: 'moderate',
  recommended_allocation: {
    emergency_fund: 25,
    low_risk: 30,
    medium_risk: 35,
    high_risk: 10,
  },
  investment_options: [
    {
      type: 'mutual_fund', name: 'Large Cap Equity Fund', sector: 'Diversified',
      risk_level: 'medium', expected_return: '10-12% annually', min_investment: 500,
      recommended_amount: 1470, allocation_percentage: 35,
      why_suitable: 'Balanced growth with professional fund management',
      pros: ['Professional management', 'Diversified portfolio', 'SIP from ₹500'],
      cons: ['Market risk', 'Exit load for 1 year'], investment_horizon: 'Medium (3-5y)',
    },
    {
      type: 'fd', name: 'Fixed Deposit', sector: 'Banking',
      risk_level: 'low', expected_return: '6-7% annually', min_investment: 1000,
      recommended_amount: 1260, allocation_percentage: 30,
      why_suitable: 'Guaranteed returns, ideal for emergency corpus',
      pros: ['Zero market risk', 'Guaranteed returns', 'Flexible tenure'],
      cons: ['Lower returns vs equity', 'Premature withdrawal penalty'], investment_horizon: 'Short (1-3y)',
    },
    {
      type: 'etf', name: 'Nifty IT ETF', sector: 'Information Technology',
      risk_level: 'high', expected_return: '12-18% annually', min_investment: 100,
      recommended_amount: 420, allocation_percentage: 10,
      why_suitable: 'High growth potential for small monthly amounts',
      pros: ['Very low expense ratio', 'High growth sector', 'Invest from ₹100'],
      cons: ['High volatility', 'Sector concentration risk'], investment_horizon: 'Long (5y+)',
    },
  ],
  ai_summary: 'Given your moderate income volatility as a gig worker, prioritize building a ₹50,000 emergency fund first. Once secure, focus on low-cost index funds and blue-chip sectors like Banking and IT for stable growth. Your current savings rate of 14% is good — aim for 20% as your income stabilizes.',
}
