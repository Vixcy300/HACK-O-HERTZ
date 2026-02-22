/**
 * useWebSocket – real-time WebSocket connection to the Incomiq backend.
 *
 * Connects to ws://<host>/ws/<userId>?token=<accessToken>
 * Automatically reconnects on disconnect (max 5 retries with exponential backoff).
 *
 * Events emitted by the server:
 *   connected, sms_alert, income_added, expense_added,
 *   clarification_needed, clarification_resolved, heartbeat, pong
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import toast from 'react-hot-toast'

// ── Types ────────────────────────────────────────────────────────

export type WSEventType =
  | 'connected'
  | 'sms_alert'
  | 'income_added'
  | 'expense_added'
  | 'clarification_needed'
  | 'clarification_resolved'
  | 'heartbeat'
  | 'pong'
  | 'error'
  | string

export interface SMSAlertEvent {
  event: 'sms_alert'
  timestamp: string
  sms_id: string
  transaction_type: 'credit' | 'debit'
  amount: number
  merchant: string
  bank_name: string
  transaction_mode: string
  risk_score: number
  risk_level: 'safe' | 'warning' | 'high_risk' | 'critical'
  alert_message: string
  suggestion: string
  needs_clarification: boolean
  is_dirty_spend: boolean
  auto_category: string
  ai_spending_insight?: string
}

export interface ClarificationNeededEvent {
  event: 'clarification_needed'
  timestamp: string
  sms_id: string
  amount: number
  merchant: string
  risk_score: number
  message: string
  suggested_categories: string[]
  // AI-enriched fields (from Groq, present when merchant is unclear UPI)
  ai_message?: string
  spending_insight?: string
  ai_confidence?: number
}

export interface IncomeAddedEvent {
  event: 'income_added'
  timestamp: string
  income: Record<string, unknown>
  message: string
}

export interface ExpenseAddedEvent {
  event: 'expense_added'
  timestamp: string
  expense: Record<string, unknown>
  message: string
}

export type WSEvent =
  | SMSAlertEvent
  | ClarificationNeededEvent
  | IncomeAddedEvent
  | ExpenseAddedEvent
  | { event: string; [key: string]: unknown }

export interface UseWebSocketOptions {
  onSMSAlert?: (evt: SMSAlertEvent) => void
  onClarificationNeeded?: (evt: ClarificationNeededEvent) => void
  onIncomeAdded?: (evt: IncomeAddedEvent) => void
  onExpenseAdded?: (evt: ExpenseAddedEvent) => void
  onAnyEvent?: (evt: WSEvent) => void
}

// ── Hook ─────────────────────────────────────────────────────────

const WS_BASE = (() => {
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  return apiBase.replace(/^http/, 'ws').replace('/api', '')
})()

const MAX_RETRIES = 5

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const user = useAppStore((s) => s.user)
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const mountedRef = useRef(true)

  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null)
  const [pendingClarifications, setPendingClarifications] = useState<ClarificationNeededEvent[]>([])

  const connect = useCallback(() => {
    if (!user?.id) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const token = localStorage.getItem('access_token') || ''
    const url = `${WS_BASE}/ws/${user.id}?token=${encodeURIComponent(token)}`

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) return
        retriesRef.current = 0
        setIsConnected(true)
        console.log('[WS] Connected to Incomiq live alerts')
      }

      ws.onmessage = (evt) => {
        if (!mountedRef.current) return
        try {
          const data: WSEvent = JSON.parse(evt.data)
          setLastEvent(data)
          options.onAnyEvent?.(data)

          switch (data.event) {
            case 'sms_alert': {
              const e = data as SMSAlertEvent
              options.onSMSAlert?.(e)
              // Show toast notification
              if (e.risk_level === 'critical' || e.risk_level === 'high_risk') {
                const insight = e.ai_spending_insight ? `\n💡 ${e.ai_spending_insight}` : ''
                toast.error(`🚨 ${e.alert_message}${insight}`, { duration: 8000 })
              } else if (e.risk_level === 'warning') {
                toast(`💡 ${e.alert_message}`, { duration: 5000 })
              } else if (e.transaction_type === 'credit') {
                toast.success(`💰 ₹${e.amount.toLocaleString('en-IN')} received${e.merchant ? ` from ${e.merchant}` : ''}`, { duration: 4000 })
              }
              break
            }
            case 'income_added': {
              const e = data as IncomeAddedEvent
              options.onIncomeAdded?.(e)
              toast.success(e.message, { duration: 5000 })
              break
            }
            case 'expense_added': {
              const e = data as ExpenseAddedEvent
              options.onExpenseAdded?.(e)
              toast(e.message, { duration: 4000 })
              break
            }
            case 'clarification_needed': {
              const e = data as ClarificationNeededEvent
              options.onClarificationNeeded?.(e)
              setPendingClarifications((prev) => [...prev, e])
              break
            }
            case 'clarification_resolved': {
              const smsId = (data as { sms_id?: string }).sms_id
              if (smsId) {
                setPendingClarifications((prev) => prev.filter((c) => c.sms_id !== smsId))
              }
              toast.success((data as { message?: string }).message || 'Transaction categorized!', { duration: 3000 })
              break
            }
          }
        } catch {
          // ignore parse errors
        }
      }

      ws.onerror = () => {
        if (!mountedRef.current) return
        setIsConnected(false)
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        setIsConnected(false)
        wsRef.current = null
        // Exponential backoff retry
        if (retriesRef.current < MAX_RETRIES) {
          const delay = Math.min(1000 * 2 ** retriesRef.current, 30000)
          retriesRef.current += 1
          retryTimeoutRef.current = setTimeout(connect, delay)
        }
      }
    } catch (err) {
      console.warn('[WS] Failed to connect:', err)
    }
  }, [user?.id]) // eslint-disable-line

  const disconnect = useCallback(() => {
    clearTimeout(retryTimeoutRef.current)
    wsRef.current?.close()
    wsRef.current = null
    setIsConnected(false)
  }, [])

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  /** Respond to a transaction clarification via WebSocket */
  const respondToClarification = useCallback(
    (smsId: string, category: string, description: string, confirmedAs: 'expense' | 'income' | 'ignore') => {
      sendMessage({
        type: 'clarification',
        sms_id: smsId,
        category,
        description,
        confirmed_as: confirmedAs,
      })
      setPendingClarifications((prev) => prev.filter((c) => c.sms_id !== smsId))
    },
    [sendMessage]
  )

  const dismissClarification = useCallback((smsId: string) => {
    setPendingClarifications((prev) => prev.filter((c) => c.sms_id !== smsId))
  }, [])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      clearTimeout(retryTimeoutRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  return {
    isConnected,
    lastEvent,
    pendingClarifications,
    sendMessage,
    respondToClarification,
    dismissClarification,
    reconnect: connect,
    disconnect,
  }
}
