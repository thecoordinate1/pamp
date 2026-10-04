import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: [
      'src/**/*.test.{js,jsx}',
      'api/**/*.test.js',
      'tests/**/*.test.js',
      'supabase/functions/**/*.test.ts',
    ],
    testTimeout: 60000,
    // The database suites boot Postgres and run every migration in beforeAll,
    // which can pass the 10s default when several start at once.
    hookTimeout: 60000,
  },
})
