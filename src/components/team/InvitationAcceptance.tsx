import { useState } from 'react'
import { Button } from '#/components/ui/button/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

export interface InvitationAcceptanceProps {
  valid: boolean
  loading?: boolean
  email?: string
  busy?: boolean
  confirmation?: boolean
  joined?: boolean
  error?: string | null
  onAuthenticate: (
    mode: 'sign-in' | 'sign-up',
    email: string,
    password: string,
  ) => Promise<void>
  onAccept: () => void
  onSignOut: () => void
  onOpenTeam: () => void
}

export default function InvitationAcceptance(props: InvitationAcceptanceProps) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <section className="grid w-full max-w-md gap-5 rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-bold">
          {props.joined ? 'Joined successfully' : 'Team invitation'}
        </h1>
        {!props.valid ? (
          <p>
            This invitation link is missing or malformed. Ask your team
            administrator for a new invitation.
          </p>
        ) : props.loading ? (
          <p>Loading your account…</p>
        ) : props.joined ? (
          <>
            <p>Your membership was created. Open your team to continue.</p>
            <Button disabled={props.busy} onClick={props.onOpenTeam}>
              {props.busy ? 'Opening team…' : 'Retry opening team'}
            </Button>
          </>
        ) : props.email ? (
          <>
            <p>
              Signed in as <strong>{props.email}</strong>. Use the email that
              received the invitation.
            </p>
            <p>Joining happens only when you choose Accept invitation.</p>
            <Button disabled={props.busy} onClick={props.onAccept}>
              {props.busy ? 'Accepting…' : 'Accept invitation'}
            </Button>
            <Button
              variant="outline"
              disabled={props.busy}
              onClick={props.onSignOut}
            >
              Use another account
            </Button>
          </>
        ) : (
          <>
            <p>
              Sign in or create an account with the email that received this
              invitation. You will review and accept it after signing in.
            </p>
            {props.confirmation && (
              <p role="status">
                Check your email to confirm your account. Open the confirmation
                link in this browser, then return here to accept. Keep this
                invitation link.
              </p>
            )}
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                void props.onAuthenticate(mode, email, password)
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="invite-password">Password</Label>
                <Input
                  id="invite-password"
                  type="password"
                  autoComplete={
                    mode === 'sign-in' ? 'current-password' : 'new-password'
                  }
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <Button type="submit" disabled={props.busy}>
                {props.busy
                  ? 'Please wait…'
                  : mode === 'sign-in'
                    ? 'Sign in'
                    : 'Create account'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={props.busy}
                onClick={() =>
                  setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
                }
              >
                {mode === 'sign-in'
                  ? 'Create an account instead'
                  : 'Sign in instead'}
              </Button>
            </form>
          </>
        )}
        {props.error && (
          <p role="alert" className="text-sm text-destructive">
            {props.error}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Invitations expire after seven days. Only the latest link works. If
          needed, ask your administrator to send a new invitation.
        </p>
        <a href="/dashboard" className="text-sm underline">
          Open dashboard
        </a>
      </section>
    </main>
  )
}
