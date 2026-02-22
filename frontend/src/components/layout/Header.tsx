import { Menu, Bell, Moon, Sun } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { useTranslation, localeNames, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export default function Header() {
  const { toggleSidebar, user, settings, updateSettings } = useAppStore()
  const { t, locale, setLocale } = useTranslation()
  const isDark = settings.darkMode

  const toggleDarkMode = () => {
    updateSettings({ darkMode: !settings.darkMode })
  }

  return (
    <header className={cn(
      "sticky top-0 z-30 h-16 backdrop-blur-xl border-b flex items-center justify-between px-6 transition-colors duration-300",
      isDark 
        ? "bg-[#0e0e0e]/95 border-white/[0.06]" 
        : "bg-white/90 border-gray-200"
    )}>
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className={cn(
            "p-2 rounded-lg transition-colors lg:hidden",
            isDark ? "hover:bg-white/8 text-gray-400" : "hover:bg-gray-100 text-gray-600"
          )}
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="hidden lg:block">
          <h2 className={cn("text-lg font-semibold tracking-tight", isDark ? "text-white" : "text-gray-900")}>
            {t('header_welcome')}{user?.name ? `, ${user.name}` : ''} 👋
          </h2>
          <p className={cn("text-sm", isDark ? "text-neutral-500" : "text-gray-500")}>
            {t('header_subtitle')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          className={cn(
            "p-2 rounded-lg transition-all duration-200",
            isDark 
              ? "hover:bg-white/8 text-amber-400 hover:text-amber-300" 
              : "hover:bg-gray-100 text-gray-600"
          )}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
        
        {/* Language switcher */}
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          className={cn(
            "text-xs border rounded-lg px-2 py-1.5 font-medium cursor-pointer transition-colors focus:outline-none focus:ring-1",
            isDark 
              ? "bg-[#1a1a1a] border-white/10 text-neutral-300 hover:bg-[#242424] focus:ring-amber-500/40" 
              : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 focus:ring-amber-300"
          )}
        >
          {(Object.entries(localeNames) as [Locale, string][]).map(([key, name]) => (
            <option key={key} value={key}>{name}</option>
          ))}
        </select>
        <button className={cn(
          "relative p-2 rounded-lg transition-colors",
          isDark ? "hover:bg-white/8 text-neutral-400 hover:text-neutral-200" : "hover:bg-gray-100 text-gray-600"
        )}>
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger-500 rounded-full" />
        </button>
        <div className={cn(
          "flex items-center gap-3 pl-3 border-l",
          isDark ? "border-white/[0.07]" : "border-gray-200"
        )}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white font-semibold text-sm shadow-md shadow-amber-500/20">
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="hidden md:block">
            <p className={cn("text-sm font-medium", isDark ? "text-white" : "text-gray-900")}>{user?.name || 'User'}</p>
            <p className={cn("text-xs", isDark ? "text-neutral-500" : "text-gray-500")}>{user?.email || ''}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
