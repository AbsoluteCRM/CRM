// Setup for the `unit` Vitest project. `src/env.ts` validates on import, so
// give the required client vars dummy values when the shell has none. Real
// values from the environment are left untouched.
const defaults: Record<string, string> = {
  VITE_SUPABASE_URL: 'http://localhost:54321',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'test-key',
}

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) process.env[key] = value
}
