import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import InvitationAcceptance from '#/components/team/InvitationAcceptance'
import { useAuth } from '#/integrations/auth/context'
import { useOrganization } from '#/integrations/organization/context'
import { useTRPC } from '#/integrations/trpc/react'

export const Route = createFileRoute('/accept-invite')({
  validateSearch: (search: Record<string, unknown>) => ({
    token:
      typeof search.token === 'string' && /^[a-f0-9]{64}$/.test(search.token)
        ? search.token
        : '',
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
  component: AcceptInvitePage,
})

function AcceptInvitePage() {
  const { token } = Route.useSearch()
  const auth = useAuth()
  const { reloadAndSelectOrganization } = useOrganization()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const trpc = useTRPC()
  const accept = useMutation(trpc.teams.acceptInvite.mutationOptions())
  const [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState<{
    organizationId: string
    userId: string
  } | null>(null)

  useEffect(() => {
    setJoined(null)
    setError(null)
  }, [token, auth.user?.id])

  async function openTeam(organizationId: string) {
    await reloadAndSelectOrganization(organizationId)
    await queryClient.invalidateQueries()
    await navigate({ to: '/dashboard' })
  }

  async function acceptInvitation() {
    if (busy || joined || !auth.user) return
    const userId = auth.user.id
    setBusy(true)
    setError(null)
    try {
      const result = await accept.mutateAsync({ token })
      setJoined({ ...result, userId })
      try {
        await openTeam(result.organizationId)
      } catch {
        setError(
          'You joined successfully, but the team could not be opened. Retry opening the team; you do not need to accept again.',
        )
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not accept the invitation. Try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <InvitationAcceptance
      valid={Boolean(token)}
      loading={auth.isLoading}
      email={auth.user?.email}
      busy={busy}
      confirmation={confirmation}
      joined={joined !== null && joined.userId === auth.user?.id}
      error={error}
      onAuthenticate={async (mode, email, password) => {
        if (busy) return
        setBusy(true)
        setError(null)
        try {
          if (mode === 'sign-up') {
            const origin = window.location.origin
            if (!(
              origin === 'https://terraformaflow.com' ||
              origin === 'http://localhost:3000'
            ))
              throw new Error(
                'Account confirmation is not configured for this app origin. Ask your administrator for help.',
              )
            const result = await auth.signUpWithPassword(email, password, {
              emailRedirectTo: `${origin}/auth/callback?token=${token}`,
            })
            if (result.error)
              throw new Error(
                'Unable to create an account. Check your details or try signing in with the invited email.',
              )
            setConfirmation(!result.hasSession)
          } else {
            const result = await auth.signInWithPassword(email, password)
            if (result.error)
              throw new Error(
                'Unable to sign in. Check your email and password, and confirm your account if needed.',
              )
          }
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to sign in. Try again.',
          )
        } finally {
          setBusy(false)
        }
      }}
      onAccept={() => {
        void acceptInvitation()
      }}
      onSignOut={() => {
        if (busy) return
        setBusy(true)
        void auth
          .signOut()
          .then(() => {
            setError(null)
            setJoined(null)
            setConfirmation(false)
          })
          .catch(() => setError('Could not sign out. Try again.'))
          .finally(() => setBusy(false))
      }}
      onOpenTeam={() => {
        if (busy || !joined || joined.userId !== auth.user?.id) return
        setBusy(true)
        setError(null)
        void openTeam(joined.organizationId)
          .catch(() =>
            setError(
              'Could not open your team. Try again or open the dashboard.',
            ),
          )
          .finally(() => setBusy(false))
      }}
    />
  )
}
