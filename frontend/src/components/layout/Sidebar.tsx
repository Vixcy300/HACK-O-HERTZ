import { NavLink, useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import {
  LayoutDashboard,
  Wallet,
  CreditCard,
  Landmark,
  Target,
  TrendingUp,
  Bot,
  Settings,
  LogOut,
  ChevronLeft,
  Shield,
  Smartphone,
  BarChart2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'

type TranslationKey = 'nav_dashboard' | 'nav_income' | 'nav_expenses' | 'nav_rules' | 'nav_goals' | 'nav_investments' | 'nav_ai_chat' | 'nav_admin' | 'nav_settings' | 'nav_sms_alerts' | 'nav_stocks'

const navItems: { to: string; labelKey: TranslationKey; icon: typeof LayoutDashboard; navKey: string; adminOnly?: boolean }[] = [
  { to: '/', labelKey: 'nav_dashboard', icon: LayoutDashboard, navKey: 'dashboard' },
  { to: '/income', labelKey: 'nav_income', icon: Wallet, navKey: 'income' },
  { to: '/expenses', labelKey: 'nav_expenses', icon: CreditCard, navKey: 'expenses' },
  { to: '/rules', labelKey: 'nav_rules', icon: Landmark, navKey: 'rules' },
  { to: '/goals', labelKey: 'nav_goals', icon: Target, navKey: 'goals' },
  { to: '/investments', labelKey: 'nav_investments', icon: TrendingUp, navKey: 'investments' },
  { to: '/stocks', labelKey: 'nav_stocks', icon: BarChart2, navKey: 'stocks' },
  { to: '/ai-chat', labelKey: 'nav_ai_chat', icon: Bot, navKey: 'ai-chat' },
  { to: '/sms-alerts', labelKey: 'nav_sms_alerts', icon: Smartphone, navKey: 'sms-alerts' },
  { to: '/admin', labelKey: 'nav_admin', icon: Shield, navKey: 'admin', adminOnly: true },
  { to: '/settings', labelKey: 'nav_settings', icon: Settings, navKey: 'settings' },
]

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar, setUser, user, settings } = useAppStore()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const isDark = settings.darkMode

  // Check if user is admin
  const isAdmin = user?.email && ['admin@incomiq.com', 'rahul@demo.com'].includes(user.email)

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    setUser(null)
    navigate('/login')
  }

  return (
    <aside
      className={cn(
        'relative h-full flex flex-col will-change-[width]',
        'transition-[width] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]',
        isDark
          ? 'bg-[#0a0a0a] border-r border-white/5'
          : 'bg-white border-r border-gray-200',
        sidebarOpen ? 'w-64' : 'w-20'
      )}
    >
      {/* Collapse Toggle Arrow */}
      <button
        onClick={toggleSidebar}
        className={cn(
          'absolute -right-3 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ease-out group hover:scale-110 active:scale-95',
          isDark
            ? 'bg-[#161616] border border-white/8 hover:bg-[#242424] hover:border-amber-500/40'
            : 'bg-white border border-gray-200 shadow-sm hover:border-amber-400 hover:bg-amber-50'
        )}
      >
        <ChevronLeft className={cn(
          "w-4 h-4 transition-all duration-300",
          isDark ? "text-gray-500 group-hover:text-amber-400" : "text-gray-500 group-hover:text-amber-500",
          !sidebarOpen && "rotate-180"
        )} />
      </button>

      {/* Header */}
      <div className={cn(
        'flex items-center h-16 px-4 overflow-hidden',
        isDark ? 'border-b border-white/5' : 'border-b border-gray-100'
      )}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20 flex-shrink-0">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <span className={cn(
            "font-bold text-xl tracking-tight whitespace-nowrap transition-all duration-500 ease-out",
            isDark ? "text-white" : "text-gray-900",
            sidebarOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4 pointer-events-none"
          )}>
            Incomiq
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto overflow-x-hidden">
        {navItems.filter(item => {
          if (isAdmin) return item.adminOnly || item.navKey === 'settings'
          return !item.adminOnly
        }).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            data-nav={item.navKey}
            className={({ isActive }) =>
              cn(
                'sidebar-link group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium',
                'transition-all duration-300 ease-out',
                sidebarOpen ? 'justify-start' : 'justify-center',
                isActive
                  ? isDark
                    ? 'bg-gradient-to-r from-amber-500/15 to-orange-500/10 text-white border border-amber-500/25'
                    : 'bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 border border-amber-200'
                  : isDark
                    ? 'text-gray-500 hover:text-white hover:bg-white/5'
                    : 'text-gray-600 hover:text-amber-700 hover:bg-amber-50/60'
              )
            }
          >
            <item.icon className={cn(
              "w-5 h-5 flex-shrink-0 transition-all duration-300",
              isDark
                ? "group-hover:text-amber-400 group-hover:drop-shadow-[0_0_8px_rgba(251,191,36,0.45)]"
                : "group-hover:text-amber-500"
            )} />
            <span className={cn(
              "whitespace-nowrap transition-all duration-500 ease-out",
              sidebarOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4 w-0 overflow-hidden"
            )}>
              {t(item.labelKey)}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn(
        'p-3 overflow-hidden',
        isDark ? 'border-t border-white/5' : 'border-t border-gray-100'
      )}>
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ease-out",
            isDark
              ? "text-gray-400 hover:bg-red-500/10 hover:text-red-400"
              : "text-gray-500 hover:bg-red-50 hover:text-red-500",
            sidebarOpen ? 'justify-start' : 'justify-center'
          )}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          <span className={cn(
            "whitespace-nowrap transition-all duration-500 ease-out",
            sidebarOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4 w-0 overflow-hidden"
          )}>
            {t('nav_logout')}
          </span>
        </button>
      </div>
    </aside>
  )
}
