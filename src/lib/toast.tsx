/**
 * App-wide toast notifications: `toast()` queues a message from anywhere
 * (components or data hooks) and `<Toaster />` renders the queue.
 */
import { useSyncExternalStore } from 'react'
import { CheckCircle2, Info, TriangleAlert } from 'lucide-react'

import { cn } from '#/lib/utils'

export interface ToastItem {
  id: number
  message: string
  tone: 'success' | 'info' | 'warning'
}
let toasts: Array<ToastItem> = []
const toastListeners = new Set<() => void>()
let toastId = 0

export function toast(message: string, tone: ToastItem['tone'] = 'success') {
  toastId += 1
  const id = toastId
  toasts = [...toasts, { id, message, tone }]
  toastListeners.forEach((l) => l())
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    toastListeners.forEach((l) => l())
  }, 3800)
}

const emptyToasts: Array<ToastItem> = []

export function Toaster() {
  const items = useSyncExternalStore(
    (l) => {
      toastListeners.add(l)
      return () => toastListeners.delete(l)
    },
    () => toasts,
    () => emptyToasts,
  )
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-5 bottom-5 z-[80] flex flex-col items-end gap-2"
    >
      {items.map((t) => {
        const Icon =
          t.tone === 'success'
            ? CheckCircle2
            : t.tone === 'warning'
              ? TriangleAlert
              : Info
        return (
          <div
            key={t.id}
            className="crm-pop pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl bg-(--leaf-900) px-4 py-3 text-sm font-medium text-(--cream) shadow-xl"
          >
            <Icon
              className={cn(
                'size-4 shrink-0',
                t.tone === 'warning' ? 'text-(--sun-100)' : 'text-(--lime)',
              )}
            />
            {t.message}
          </div>
        )
      })}
    </div>
  )
}
