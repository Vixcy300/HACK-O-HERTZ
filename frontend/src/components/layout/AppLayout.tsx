import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

export default function AppLayout() {
  const { settings } = useAppStore()
  const location = useLocation()

  return (
    <div className={cn("flex h-screen overflow-hidden", settings.darkMode ? "bg-[#0a0a0a]" : "bg-gray-50")}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main
          key={location.pathname}
          className={cn(
            "flex-1 overflow-y-auto p-6 page-enter scroll-smooth",
            settings.darkMode ? "bg-[#0a0a0a]" : "bg-gray-50"
          )}
          style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
