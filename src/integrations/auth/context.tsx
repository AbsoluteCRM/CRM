/**
 * Authentication context for the application.
 *
 * Fetches the current user authentication context for the application.
 * Provides authentication-related utilities and state.
 * Wraps the application with the authentication context.
 */
import { createContext, use, useEffect, useMemo, useState } from 'react'

import { createSupabaseBrowserClient } from '#/lib/supabase/client'

import type { User } from '@supabase/supabase-js'
import type { ReactNode } from 'react'

interface AuthResult {
  error: string | null
}

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>
  signUpWithPassword: (email: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null)
      setIsLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      signInWithPassword: async (email, password) => {
        const supabase = createSupabaseBrowserClient()
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        return { error: error?.message ?? null }
      },
      signUpWithPassword: async (email, password) => {
        const supabase = createSupabaseBrowserClient()
        const { error } = await supabase.auth.signUp({ email, password })
        return { error: error?.message ?? null }
      },
      signOut: async () => {
        const supabase = createSupabaseBrowserClient()
        await supabase.auth.signOut()
      },
    }),
    [user, isLoading],
  )

  console.log(user)
  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  const context = use(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
