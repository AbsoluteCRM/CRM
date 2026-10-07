import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'

import { useAuth } from '#/integrations/auth/context'
import { Button } from '#/components/ui/button/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

export const Route = createFileRoute('/sign-in')({
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

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        Loading...
      </div>
    )
  }

  if (isAuthenticated) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4">
        <p className="text-lg">Signed in as {user?.email}</p>
        <Button
          onClick={async () => {
            await signOut()
            navigate({ to: '/' })
          }}
        >
          Sign out
        </Button>
      </div>
    )
  }

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
    <div className="flex min-h-svh items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 p-8"
      >
        <h1 className="text-2xl font-bold">Sign in</h1>

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={isSubmitting}>
          Sign in
        </Button>

        <Link
          to="/sign-up"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Don't have an account? Sign up
        </Link>
      </form>
    </div>
  )
}
