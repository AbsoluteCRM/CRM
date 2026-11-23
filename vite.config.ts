/// <reference types="vitest/config" />
import babel from '@rolldown/plugin-babel'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { nitro } from 'nitro/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

const dirname =
  typeof import.meta.dirname !== 'undefined'
    ? import.meta.dirname
    : path.dirname(fileURLToPath(import.meta.url))

// `src/env.ts` validates on import, so stories that reach it need the required
// client vars. Use real values from the shell or `.env*` files when present,
// and dummy ones otherwise (CI, fresh worktrees).
const fileEnv = loadEnv('test', dirname, 'VITE_')
const storybookEnv = {
  VITE_SUPABASE_URL:
    process.env.VITE_SUPABASE_URL ||
    fileEnv.VITE_SUPABASE_URL ||
    'http://localhost:54321',
  VITE_SUPABASE_PUBLISHABLE_KEY:
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
    'test-key',
}

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    devtools(),
    // Nitro's dev server is not needed by tests. Under Vitest it evaluates
    // CommonJS React in the module runner ("module is not defined") and keeps
    // the process from exiting, so leave it out there.
    process.env.VITEST
      ? null
      : nitro({
          rollupConfig: {
            external: [/^@sentry\//],
          },
        }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
          }),
        ],
        test: {
          name: 'storybook',
          env: storybookEnv,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [
              {
                browser: 'chromium',
              },
            ],
          },
        },
      },
    ],
  },
})
export default config
