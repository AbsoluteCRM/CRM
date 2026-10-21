import { useState } from 'react'
import { CheckCircle2, Clock3, MailCheck, ShieldCheck } from 'lucide-react'
import { Logo } from '#/components/crm/Logo'
import { Btn, Field, TextInput } from '#/components/crm/ui'

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
    <main className="flex min-h-svh items-center justify-center bg-(--cream) px-4 py-8 text-(--ink) sm:py-12">
      <section className="w-full max-w-lg overflow-hidden rounded-[26px] border border-(--line) bg-(--paper) shadow-[0_16px_60px_-28px_rgba(17,48,31,0.3)]">
        <header className="bg-(--leaf-900) px-6 py-7 sm:px-8 sm:py-8">
          <Logo dark />
          <div className="mt-8 flex items-center gap-2 text-xs font-semibold tracking-wider text-(--lime) uppercase">
            {props.joined ? (
              <CheckCircle2 aria-hidden className="size-4" />
            ) : (
              <ShieldCheck aria-hidden className="size-4" />
            )}
            <span>Your team</span>
          </div>
          <h1 className="crm-display mt-2 text-[32px] leading-tight font-semibold text-(--cream) sm:text-4xl">
            {props.joined ? 'Joined successfully' : 'Team invitation'}
          </h1>
        </header>
        <div className="grid min-w-0 gap-5 px-6 py-7 text-sm leading-relaxed text-(--ink-2) sm:px-8 sm:py-8">
          {!props.valid ? (
            <p className="rounded-2xl border border-(--line) bg-(--cream) p-4">
              This invitation link is missing or malformed. Ask your team
              administrator for a new invitation.
            </p>
          ) : props.loading ? (
            <p
              role="status"
              className="rounded-2xl bg-(--sage) p-4 text-(--leaf-800)"
            >
              Loading your account…
            </p>
          ) : props.joined ? (
            <>
              <p className="rounded-2xl border border-(--lime-200) bg-(--lime-100) p-4 text-(--leaf-800)">
                Your membership was created. Open your team to continue.
              </p>
              <Btn
                size="lg"
                className="w-full"
                disabled={props.busy}
                onClick={props.onOpenTeam}
              >
                {props.busy ? 'Opening team…' : 'Retry opening team'}
              </Btn>
            </>
          ) : props.email ? (
            <>
              <p className="min-w-0 rounded-2xl border border-(--line) bg-(--cream) p-4">
                Signed in as{' '}
                <strong className="font-semibold text-(--ink) [overflow-wrap:anywhere]">
                  {props.email}
                </strong>
                . Use the email that received the invitation.
              </p>
              <p>Joining happens only when you choose Accept invitation.</p>
              <Btn
                size="lg"
                className="w-full"
                disabled={props.busy}
                onClick={props.onAccept}
              >
                {props.busy ? 'Accepting…' : 'Accept invitation'}
              </Btn>
              <Btn
                variant="outline"
                size="lg"
                className="w-full"
                disabled={props.busy}
                onClick={props.onSignOut}
              >
                Use another account
              </Btn>
            </>
          ) : (
            <>
              <p>
                Sign in or create an account with the email that received this
                invitation. You will review and accept it after signing in.
              </p>
              {props.confirmation && (
                <p
                  role="status"
                  className="rounded-2xl border border-(--lime-200) bg-(--lime-100) p-4 text-(--leaf-800)"
                >
                  <MailCheck aria-hidden className="mb-2 size-5" />
                  Check your email to confirm your account. Open the
                  confirmation link in this browser, then return here to accept.
                  Keep this invitation link.
                </p>
              )}
              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void props.onAuthenticate(mode, email, password)
                }}
              >
                <Field label="Email" htmlFor="invite-email">
                  <TextInput
                    id="invite-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field>
                <Field label="Password" htmlFor="invite-password">
                  <TextInput
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
                </Field>
                <Btn
                  size="lg"
                  className="mt-1 w-full"
                  type="submit"
                  disabled={props.busy}
                >
                  {props.busy
                    ? 'Please wait…'
                    : mode === 'sign-in'
                      ? 'Sign in'
                      : 'Create account'}
                </Btn>
                <Btn
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full"
                  disabled={props.busy}
                  onClick={() =>
                    setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
                  }
                >
                  {mode === 'sign-in'
                    ? 'Create an account instead'
                    : 'Sign in instead'}
                </Btn>
              </form>
            </>
          )}
          {props.error && (
            <p
              role="alert"
              className="rounded-2xl border border-(--clay)/30 bg-(--clay-100) p-4 text-(--ink) [overflow-wrap:anywhere]"
            >
              {props.error}
            </p>
          )}
        </div>
        <footer className="grid gap-4 border-t border-(--line) bg-(--cream)/60 px-6 py-5 sm:px-8">
          <p className="flex items-start gap-2.5 text-xs leading-relaxed text-(--ink-2)">
            <Clock3
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-(--leaf-600)"
            />
            <span>
              Invitations expire after seven days. Only the latest link works.
              If needed, ask your administrator to send a new invitation.
            </span>
          </p>
          <a
            href="/dashboard"
            className="w-fit rounded-md text-sm font-semibold text-(--leaf-700) underline decoration-(--leaf-300) underline-offset-4 outline-none hover:text-(--leaf-900) focus-visible:ring-[3px] focus-visible:ring-(--lime)"
          >
            Open dashboard
          </a>
        </footer>
      </section>
    </main>
  )
}
