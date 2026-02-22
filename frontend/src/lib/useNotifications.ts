/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useState } from 'react'
import toast from 'react-hot-toast'
import { notificationApi } from '@/lib/api'

export function useNotifications() {
  const supported = 'Notification' in window && 'serviceWorker' in navigator
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  )
  const [isSupported] = useState(supported)

  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      toast.error('Notifications not supported in this browser')
      return false
    }

    const result = await Notification.requestPermission()
    setPermission(result)

    if (result === 'granted') {
      // Register service worker
      try {
        const registration = await navigator.serviceWorker.register('/sw.js')
        console.log('SW registered:', registration.scope)

        // Subscribe to push
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: undefined, // Would need VAPID key for production
        })

        // Send subscription to backend
        const sub = subscription.toJSON()
        await notificationApi.subscribePush({
          endpoint: sub.endpoint || '',
          keys: sub.keys || {},
        })

        toast.success('Push notifications enabled!')
        return true
      } catch (err: any) {
        console.warn('Push subscription failed:', err)
        // Still show browser notifications even if push fails
        toast.success('Notifications enabled (local only)')
        return true
      }
    } else {
      toast.error('Notification permission denied')
      return false
    }
  }, [isSupported])

  const showLocalNotification = useCallback(
    (title: string, body: string, options?: { url?: string }) => {
      if (permission !== 'granted') return

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, {
            body,
            icon: '/vite.svg',
            badge: '/vite.svg',
            // vibrate: [200, 100, 200],
            data: { url: options?.url || '/' },
          })
        }).catch(() => {
          // Fallback to basic notification
          new Notification(title, { body, icon: '/vite.svg' })
        })
      } else {
        new Notification(title, { body, icon: '/vite.svg' })
      }
    },
    [permission],
  )

  const sendTestEmail = useCallback(async () => {
    try {
      const res = await notificationApi.sendEmail('test')
      if (res.ok) {
        toast.success('Test email sent! Check your inbox.')
      } else {
        toast.error('Failed to send test email')
      }
    } catch {
      toast.error('Email service unavailable')
    }
  }, [])

  return {
    permission,
    isSupported,
    requestPermission,
    showLocalNotification,
    sendTestEmail,
  }
}
