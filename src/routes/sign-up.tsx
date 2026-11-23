import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowRight, LogOut } from 'lucide-react'

import AuthShell, { AuthCard } from '#/components/auth/AuthShell'
import PasswordInput from '#/components/auth/PasswordInput'
import { Alert, Btn, Field, TextInput, btnClass } from '#/components/crm/ui'
import { useAuth } from '#/integrations/auth/context'

export const Route = createFileRoute('/sign-up')({
  head: () => ({ meta: [{ title: 'Start your free trial · AbsoluteCRM' }] }),
  component: SignUpPage,
})

function SignUpPage() {
  const { user, isLoading, isAuthenticated, signUpWithPassword, signOut } =
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
    const { error: authError } = await signUpWithPassword(email, password)
    setIsSubmitting(false)
    if (authError) {
      setError(authError)
      return
    }
    navigate({ to: '/' })
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
          title="Start your free trial"
          subtitle="Create your account, then set up your company."
          footer={
            <>
              Already have an account?{' '}
              <Link
                to="/sign-in"
                className="font-semibold text-(--leaf-700) underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </>
          }
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert tone="danger" title="We couldn’t create your account">
                {error}
              </Alert>
            )}
            <Field label="Work email" htmlFor="email">
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
            <Field
              label="Password"
              htmlFor="password"
              hint="At least 6 characters."
            >
              <PasswordInput
                id="password"
                autoComplete="new-password"
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
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </Btn>
          </form>
        </AuthCard>
      )}
    </AuthShell>
  )
}
