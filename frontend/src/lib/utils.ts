import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num)
}

export function formatPercentage(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

export function getRelativeTime(date: Date | string): string {
  const now = new Date()
  const d = new Date(date)
  const diff = now.getTime() - d.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 30) return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''} ago`
  return 'Just now'
}

export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    freelance: '#2563EB',
    delivery: '#F59E0B',
    content: '#EF4444',
    rideshare: '#10B981',
    tutoring: '#06B6D4',
    ecommerce: '#0EA5E9',
    other: '#6B7280',
    food: '#F59E0B',
    transport: '#3B82F6',
    entertainment: '#EF4444',
    shopping: '#10B981',
    bills: '#6366F1',
  }
  return colors[category.toLowerCase()] || '#6B7280'
}

export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    freelance: '💻',
    delivery: '🚚',
    content: '🎬',
    rideshare: '🚗',
    tutoring: '📚',
    ecommerce: '🛒',
    other: '📦',
    food: '🍔',
    transport: '🚌',
    entertainment: '🎮',
    shopping: '🛍️',
    bills: '📄',
  }
  return icons[category.toLowerCase()] || '📦'
}
