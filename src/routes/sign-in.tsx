import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowRight, LogOut } from 'lucide-react'

import AuthShell, { AuthCard } from '#/components/auth/AuthShell'
import PasswordInput from '#/components/auth/PasswordInput'
import { Alert, Btn, Field, TextInput, btnClass } from '#/components/crm/ui'
import { useAuth } from '#/integrations/auth/context'

export const Route = createFileRoute('/sign-in')({
  head: () => ({ meta: [{ title: 'Sign in · AbsoluteCRM' }] }),
  component: SignInPage,
})

function SignInPage() {
  const { user, isLoading, isAuthenticated, signInWithPassword, signOut } =
    useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    const { error: authError } = await signInWithPassword(email, password)
    setIsSubmitting(false)
    if (authError) {
      setError(authError)
      return
    }
    navigate({ to: '/dashboard' })
  }

  return (
    <AuthShell>
      {isLoading ? (
        <p role="status" className="text-center text-sm text-(--ink-3)">
          Loading…
        </p>
      ) : isAuthenticated ? (
        <AuthCard
          title="You’re signed in"
          subtitle={
            <>
              Signed in as <strong>{user?.email}</strong>.
            </>
          }
        >
          <div className="flex flex-col gap-2">
            <Link
              to="/dashboard"
              className={btnClass('primary', 'lg', 'w-full')}
            >
              Go to dashboard <ArrowRight className="size-4" />
            </Link>
            <Btn
              variant="ghost"
              icon={LogOut}
              className="w-full"
              onClick={async () => {
                await signOut()
                navigate({ to: '/' })
              }}
            >
              Sign out
            </Btn>
          </div>
        </AuthCard>
      ) : (
        <AuthCard
          title="Welcome back"
          subtitle="Sign in to your AbsoluteCRM workspace."
          footer={
            <>
              New to AbsoluteCRM?{' '}
              <Link
                to="/sign-up"
                className="font-semibold text-(--leaf-700) underline-offset-4 hover:underline"
              >
                Start your free trial
              </Link>
            </>
          }
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert tone="danger" title="We couldn’t sign you in">
                {error}
              </Alert>
            )}
            <Field label="Email" htmlFor="email">
              <TextInput
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
                className="h-11"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <PasswordInput
                id="password"
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Btn
              type="submit"
              size="lg"
              className="mt-2 w-full"
              disabled={isSubmitting}
              iconRight={isSubmitting ? undefined : ArrowRight}
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Btn>
          </form>
        </AuthCard>
      )}
    </AuthShell>
  )
}
