import { useEffect, useRef } from 'react'

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
      theme?: 'light' | 'dark' | 'auto'
    },
  ) => string
  reset: (id: string) => void
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<TurnstileApi> | null = null

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('load'))
    script.onerror = () => {
      loading = null
      reject(new Error('load'))
    }
    document.head.appendChild(script)
  })
  return loading
}

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as
  string | undefined

/**
 * Cloudflare Turnstile "not a robot" check. Renders nothing when no site key
 * is configured. `resetKey` re-runs the check (after a failed submit).
 */
export default function Turnstile({
  onToken,
  resetKey = 0,
}: {
  onToken: (token: string | null) => void
  resetKey?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const latest = useRef(onToken)
  latest.current = onToken

  useEffect(() => {
    const sitekey = TURNSTILE_SITE_KEY
    if (!sitekey || !ref.current) return
    let cancelled = false
    const el = ref.current
    void loadTurnstile()
      .then((api) => {
        if (cancelled) return
        widget.current = api.render(el, {
          sitekey,
          callback: (token) => latest.current(token),
          'expired-callback': () => latest.current(null),
          'error-callback': () => latest.current(null),
          theme: 'light',
        })
      })
      .catch(() => latest.current(null))
    return () => {
      cancelled = true
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = null
    }
  }, [])

  useEffect(() => {
    if (resetKey > 0 && widget.current) {
      window.turnstile?.reset(widget.current)
      latest.current(null)
    }
  }, [resetKey])

  if (!TURNSTILE_SITE_KEY) return null
  return <div ref={ref} className="min-h-[65px]" />
}
