/* eslint-disable @typescript-eslint/no-explicit-any */
// Use environment variable for production, fallback to proxy for development
const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('access_token')
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(error.detail || `HTTP ${res.status}`)
  }

  return res.json()
}

// ──── Auth ────
export const authApi = {
  login: (email: string, password: string) =>
    request<{ access_token: string; user: { id: string; email: string; name: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string, name: string) =>
    request<{ access_token: string; user: { id: string; email: string; name: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  me: () => request<{ id: string; email: string; name: string }>('/auth/me'),
}

// ──── Income ────
export const incomeApi = {
  list: (params?: { page?: number; category?: string; source?: string; date_from?: string; date_to?: string }) => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.category) searchParams.set('category', params.category)
    if (params?.source) searchParams.set('source', params.source)
    if (params?.date_from) searchParams.set('date_from', params.date_from)
    if (params?.date_to) searchParams.set('date_to', params.date_to)
    const qs = searchParams.toString()
    return request<{ incomes: any[]; total: number; page: number; pages: number }>(`/incomes${qs ? `?${qs}` : ''}`)
  },
  create: (data: { amount: number; source_name: string; category: string; date: string; description?: string; tags?: string[] }) =>
    request<any>('/incomes', { method: 'POST', body: JSON.stringify(data) }),
  uploadCSV: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const token = localStorage.getItem('access_token')
    return fetch(`${API_BASE}/incomes/upload-csv`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(r => r.json())
  },
  delete: (id: string) => request<{ ok: boolean }>(`/incomes/${id}`, { method: 'DELETE' }),
}

// ──── Expenses ────
export const expenseApi = {
  list: (params?: { page?: number; category?: string }) => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.category) searchParams.set('category', params.category)
    const qs = searchParams.toString()
    return request<{ expenses: any[]; total: number }>(`/expenses${qs ? `?${qs}` : ''}`)
  },
  create: (data: { amount: number; category: string; date: string; description?: string; payment_method?: string }) =>
    request<any>('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => request<{ ok: boolean }>(`/expenses/${id}`, { method: 'DELETE' }),
  checkOverspending: (data: { amount: number; category: string; description?: string; monthly_income?: number }) =>
    request<any>('/expenses/check-overspending', { method: 'POST', body: JSON.stringify(data) }),
}

// ──── Savings Rules ────
export const rulesApi = {
  list: () => request<{ rules: any[] }>('/rules'),
  create: (data: any) => request<any>('/rules', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request<any>(`/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/rules/${id}`, { method: 'DELETE' }),
  toggle: (id: string) => request<any>(`/rules/${id}/toggle`, { method: 'POST' }),
  templates: () => request<{ templates: any[] }>('/rules/templates'),
}

// ──── Savings Goals ────
export const goalsApi = {
  list: () => request<{ goals: any[] }>('/goals'),
  create: (data: any) => request<any>('/goals', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request<any>(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/goals/${id}`, { method: 'DELETE' }),
  addMoney: (id: string, amount: number) =>
    request<any>(`/goals/${id}/add-money`, { method: 'POST', body: JSON.stringify({ amount }) }),
}

// ──── Dashboard / Analytics ────
export const analyticsApi = {
  dashboard: () => request<any>('/analytics/dashboard'),
  volatility: () => request<any>('/analytics/volatility'),
  insights: () => request<any>('/analytics/insights'),
  predictions: () => request<any>('/analytics/predictions'),
  spendingBreakdown: () => request<any>('/analytics/spending-breakdown'),
  savingsSuggestions: () => request<any>('/analytics/savings-suggestions'),
  streaks: () => request<{ streaks: Array<{ type: string; currentStreak: number; bestStreak: number }> }>('/analytics/streaks'),
  incomeChart: (period?: string) => {
    const qs = period ? `?period=${period}` : ''
    return request<any>(`/analytics/income-chart${qs}`)
  },
}

// ──── Investments ────
export const investmentApi = {
  recommendations: () => request<any>('/investments/recommendations'),
  submitQuiz: (answers: any) =>
    request<any>('/investments/risk-quiz', { method: 'POST', body: JSON.stringify(answers) }),
  sectors: () => request<any>('/investments/sectors'),
}

// ──── Transactions (Combined CSV Upload) ────
export const transactionsApi = {
  uploadCSV: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const token = localStorage.getItem('access_token')
    return fetch(`${API_BASE}/transactions/upload-csv`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(r => r.json()) as Promise<{
      total_rows: number
      income_detected: number
      expense_detected: number
      categories_found: Record<string, number>
      incomes: any[]
      expenses: any[]
      errors: string[]
    }>
  },
}

// ──── Notifications ────
export const notificationApi = {
  subscribePush: (subscription: { endpoint: string; keys: object }) =>
    request<any>('/notifications/subscribe-push', { method: 'POST', body: JSON.stringify(subscription) }),
  unsubscribePush: () =>
    request<any>('/notifications/unsubscribe-push', { method: 'DELETE' }),
  sendEmail: (type: string, data?: object) =>
    request<any>('/notifications/send-email', { method: 'POST', body: JSON.stringify({ type, data }) }),
  getPreferences: () => request<any>('/notifications/preferences'),
  updatePreferences: (prefs: object) =>
    request<any>('/notifications/preferences', { method: 'PUT', body: JSON.stringify(prefs) }),
}

// ──── WhatsApp Notifications ────
export const whatsappApi = {
  getSettings: () => request<{ phone_number: string | null; enabled: boolean }>('/notifications/whatsapp/settings'),
  updateSettings: (settings: { phone_number?: string; enabled: boolean }) =>
    request<any>('/notifications/whatsapp/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  sendMessage: (type: string, phone_number: string, data?: object, custom_message?: string) =>
    request<any>('/notifications/whatsapp/send', { 
      method: 'POST', 
      body: JSON.stringify({ type, phone_number, data, custom_message }) 
    }),
  sendTest: (phone_number: string) =>
    request<any>(`/notifications/whatsapp/test?phone_number=${encodeURIComponent(phone_number)}`, { method: 'POST' }),
}

// ──── AI Chat ────
export const aiChatApi = {
  send: (message: string, language: string = 'en') =>
    request<{ response: string; language: string }>('/ai-chat', { 
      method: 'POST', 
      body: JSON.stringify({ message, language }) 
    }),
}

// ──── SMS Webhook / Alerts ────
export const smsApi = {
  records: (params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.page) qs.set('page', String(params.page))
    if (params?.limit) qs.set('limit', String(params.limit))
    return request<{ records: any[]; total: number; page: number }>(`/sms/records${qs.toString() ? `?${qs}` : ''}`)
  },
  webhookInfo: () => request<any>('/sms/webhook-info'),
  registerDevice: (phone: string) =>
    request<any>(`/sms/register-device?phone=${encodeURIComponent(phone)}`, { method: 'POST' }),
  clarify: (data: {
    sms_id: string
    user_id: string
    category: string
    description: string
    confirmed_as: 'expense' | 'income' | 'ignore'
  }) => request<any>('/sms/clarify', { method: 'POST', body: JSON.stringify(data) }),
  /** Test: Simulate receiving a fake bank SMS (dev only) */
  testWebhook: (content: string, senderID: string = 'HDFCBK') =>
    request<any>('/sms/webhook', {
      method: 'POST',
      body: JSON.stringify({ content, sender_id: senderID, message_id: `test-${Date.now()}` }),
      headers: { 'X-Webhook-Secret': 'incomiq-sms-secret-2024' },
    }),
}

// ──── Admin Dashboard ────
export const adminApi = {
  dashboard: () => request<any>('/admin/dashboard'),
  lowIncomeAlerts: () => request<{ total_alerts: number; alerts: any[] }>('/admin/alerts/low-income'),
  ruleAnalytics: () => request<any>('/admin/analytics/rules'),
  investmentAnalytics: () => request<any>('/admin/analytics/investments'),
  complianceChecks: (minAmount?: number) => {
    const qs = minAmount ? `?min_amount=${minAmount}` : ''
    return request<{ total_flagged: number; threshold: number; transactions: any[] }>(`/admin/compliance/transactions${qs}`)
  },
  usersOverview: () => request<{ total_users: number; users: any[] }>('/admin/users/overview'),
}
