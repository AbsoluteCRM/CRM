import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createSupabaseBrowserClient } from '#/lib/supabase/client'

export const Route = createFileRoute('/auth/callback')({
  validateSearch: (search: Record<string, unknown>) => ({
    token:
      typeof search.token === 'string' && /^[a-f0-9]{64}$/.test(search.token)
        ? search.token
        : '',
    code: typeof search.code === 'string' ? search.code : '',
    denied: typeof search.error === 'string',
  }),
  headers: () => ({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  }),
  head: () => ({
    meta: [
      { name: 'referrer', content: 'no-referrer' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AuthCallbackPage,
})

function AuthCallbackPage() {
  const { token, code, denied } = Route.useSearch()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    if (!token || !code || denied) {
      setFailed(true)
      return
    }
    // The singleton browser client detects the PKCE callback during initialization.
    // getSession waits for that exchange; exchanging the code twice would consume it.
    void createSupabaseBrowserClient()
      .auth.getSession()
      .then(async ({ data, error }) => {
        if (cancelled) return
        if (error || !data.session) {
          setFailed(true)
          return
        }
        try {
          await navigate({
            to: '/accept-invite',
            search: { token },
            replace: true,
          })
        } catch {
          setFailed(true)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [token, code, denied, navigate])
  return (
    <main className="mx-auto grid min-h-svh max-w-md content-center gap-4 p-8">
      <h1 className="text-2xl font-bold">
        {failed ? 'Unable to finish confirmation' : 'Confirming your account…'}
      </h1>
      {failed && (
        <>
          <p>
            The confirmation link may have expired, been denied, or been opened
            in another browser. Sign in in the original browser, then reopen
            your original invitation. You have not joined the team yet.
          </p>
          <a
            className="underline"
            href={token ? `/accept-invite?token=${token}` : '/sign-in'}
          >
            Return to sign in
          </a>
        </>
      )}
    </main>
  )
}
