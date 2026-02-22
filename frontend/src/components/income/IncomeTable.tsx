import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table'
import { ArrowUpDown, Trash2, ChevronLeft, ChevronRight, Search, TrendingUp, Briefcase, Car, ShoppingBag, BookOpen, Package, Video } from 'lucide-react'
import { formatCurrency, getRelativeTime, cn } from '@/lib/utils'
import type { Income } from '@/types'

// Map source name keywords → actual company domain (for favicon lookup)
const COMPANY_DOMAINS: Record<string, string> = {
  uber: 'uber.com',
  zepto: 'zeptonow.com',
  swiggy: 'swiggy.com',
  zomato: 'zomato.com',
  rapido: 'rapido.bike',
  dunzo: 'dunzo.com',
  ola: 'olacabs.com',
  amazon: 'amazon.in',
  flipkart: 'flipkart.com',
  meesho: 'meesho.com',
  blinkit: 'blinkit.com',
  bigbasket: 'bigbasket.com',
  instamart: 'swiggy.com',
  youtube: 'youtube.com',
  udemy: 'udemy.com',
  fiverr: 'fiverr.com',
  upwork: 'upwork.com',
  freelancer: 'freelancer.com',
  groww: 'groww.in',
  phonepe: 'phonepe.com',
  paytm: 'paytm.com',
  google: 'google.com',
  meta: 'meta.com',
  instagram: 'instagram.com',
  porter: 'porter.in',
  borzo: 'borzo.com',
  shadowfax: 'shadowfax.in',
  shiprocket: 'shiprocket.in',
}

// Brand colours for initial-badge fallback (no network needed)
const BRAND_COLORS: Record<string, string> = {
  uber: '#000000', zepto: '#8B5CF6', swiggy: '#FC8019', zomato: '#E23744',
  rapido: '#FFD700', dunzo: '#00B140', ola: '#F5A623', amazon: '#FF9900',
  flipkart: '#2874F0', meesho: '#F43397', blinkit: '#F8CC1B', bigbasket: '#84C225',
  youtube: '#FF0000', udemy: '#A435F0', fiverr: '#1DBF73', upwork: '#14A800',
  freelancer: '#29B2FE', groww: '#00D09C', phonepe: '#5F259F', paytm: '#002970',
  google: '#4285F4', instagram: '#E1306C', meta: '#0668E1',
}

/** Google Favicon Service URL — very reliable, served from Google's CDN */
function getFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
}

/** Find best domain match for a source name, returns null if unknown */
function getDomain(sourceName: string): string | null {
  const key = sourceName.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const [k, domain] of Object.entries(COMPANY_DOMAINS)) {
    if (key.includes(k) || (k.length >= 4 && key.startsWith(k.substring(0, 4)))) return domain
  }
  return null
}

/** Get brand colour for initial badge */
function getBrandColor(sourceName: string): string {
  const key = sourceName.toLowerCase()
  for (const [k, color] of Object.entries(BRAND_COLORS)) {
    if (key.includes(k)) return color
  }
  return '#6366F1' // indigo default
}

// Category icons & gradient maps (also used in the category badge column)
const categoryIcons: Record<string, React.ReactNode> = {
  freelance: <Briefcase className="w-4 h-4" />,
  delivery: <Package className="w-4 h-4" />,
  content: <Video className="w-4 h-4" />,
  rideshare: <Car className="w-4 h-4" />,
  tutoring: <BookOpen className="w-4 h-4" />,
  ecommerce: <ShoppingBag className="w-4 h-4" />,
}
const categoryGradients: Record<string, string> = {
  freelance: 'from-blue-500 to-indigo-500',
  delivery: 'from-orange-500 to-red-500',
  content: 'from-pink-500 to-purple-500',
  rideshare: 'from-green-500 to-emerald-500',
  tutoring: 'from-cyan-500 to-blue-500',
  ecommerce: 'from-amber-500 to-orange-500',
}

/** Source logo with Google favicon + branded-initial fallback */
function SourceLogo({ name, category }: { name: string; category: string }) {
  const [failed, setFailed] = useState(false)
  const domain = getDomain(name)

  if (domain && !failed) {
    return (
      <img
        src={getFaviconUrl(domain)}
        alt={name}
        onError={() => setFailed(true)}
        className="w-8 h-8 rounded-lg object-contain bg-white border border-gray-100 shadow-sm p-0.5"
      />
    )
  }

  // Fallback: branded initial badge — zero network requests
  const initial = name.charAt(0).toUpperCase()
  if (domain || name) {
    const bg = getBrandColor(name)
    return (
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm"
        style={{ backgroundColor: bg }}
      >
        {initial}
      </div>
    )
  }

  // Last resort: category gradient icon
  return (
    <div className={`w-8 h-8 rounded-lg bg-gradient-to-r ${categoryGradients[category] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white shadow-sm`}>
      {categoryIcons[category] || <TrendingUp className="w-4 h-4" />}
    </div>
  )
}

interface IncomeTableProps {
  incomes: Income[]
  onDelete: (id: string) => void
}

export default function IncomeTable({ incomes, onDelete }: IncomeTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }])
  const [globalFilter, setGlobalFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const columns = useMemo<ColumnDef<Income>[]>(
    () => [
      {
        accessorKey: 'date',
        header: ({ column }) => (
          <button className="flex items-center gap-1 font-medium" onClick={() => column.toggleSorting()}>
            Date <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {new Date(row.original.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{getRelativeTime(row.original.date)}</p>
          </div>
        ),
      },
      {
        accessorKey: 'source_name',
        header: 'Source',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <SourceLogo name={row.original.source_name} category={row.original.category} />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{row.original.source_name}</span>
          </div>
        ),
      },
      {
        accessorKey: 'category',
        header: 'Category',
        cell: ({ row }) => {
          const cat = row.original.category
          const gradient = categoryGradients[cat] || 'from-gray-500 to-gray-600'
          const icon = categoryIcons[cat] || <TrendingUp className="w-4 h-4" />
          return (
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${gradient} text-white text-xs font-medium shadow-sm`}>
              {icon}
              <span>{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
            </div>
          )
        },
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => (
          <button className="flex items-center gap-1 font-medium ml-auto" onClick={() => column.toggleSorting()}>
            Amount <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ row }) => (
          <div className="text-right">
            <p className="text-sm font-bold text-green-600 dark:text-green-400">
              +{formatCurrency(row.original.amount)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[200px]">{row.original.description || '—'}</p>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onDelete(row.original.id)}
            className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors duration-200"
          >
            <Trash2 className="w-4 h-4" />
          </motion.button>
        ),
      },
    ],
    [onDelete]
  )

  const filteredData = useMemo(() => {
    let data = incomes
    if (categoryFilter) {
      data = data.filter(d => d.source_name === categoryFilter)
    }
    return data
  }, [incomes, categoryFilter])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  })

  // Get unique source names from actual data for filter tabs
  const uniqueSources = useMemo(() => {
    const seen = new Set<string>()
    return incomes
      .map((i) => ({ name: i.source_name, category: i.category }))
      .filter((s) => {
        if (seen.has(s.name)) return false
        seen.add(s.name)
        return true
      })
      .slice(0, 8) // max 8 tabs
  }, [incomes])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
      {/* Filters */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search income..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-white transition-all duration-300"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setCategoryFilter('')}
            className={cn(
              'px-4 py-2 text-xs font-semibold rounded-xl transition-all duration-300 flex items-center gap-1.5 shadow-sm',
              !categoryFilter 
                ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-purple-200' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            )}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            All Sources
          </motion.button>
          {uniqueSources.map(({ name, category }) => {
            const isActive = categoryFilter === name
            const gradient = categoryGradients[category] || 'from-gray-500 to-gray-600'
            const icon = categoryIcons[category] || <TrendingUp className="w-3.5 h-3.5" />
            return (
              <motion.button
                key={name}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setCategoryFilter(categoryFilter === name ? '' : name)}
                className={cn(
                  'px-4 py-2 text-xs font-semibold rounded-xl transition-all duration-300 flex items-center gap-1.5 shadow-sm',
                  isActive 
                    ? `bg-gradient-to-r ${gradient} text-white` 
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                )}
              >
                {icon}
                {name}
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                {hg.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, index) => (
              <motion.tr 
                key={row.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-colors duration-200"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
          {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, filteredData.length)} of{' '}
          {filteredData.length} entries
        </p>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="p-2 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
          >
            <ChevronLeft className="w-4 h-4" />
          </motion.button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="p-2 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
          >
            <ChevronRight className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </div>
  )
}
