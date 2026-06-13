import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Unit tests for the pure logic libs (recurrence, parsing, ordering, groups,
  // privacy …). Co-located as src/**/*.test.js; run with `npm test`.
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks: app-code changes don't bust the framework
        // cache on phones, and no chunk crosses the 500 kB line.
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
          icons: ['react-feather'],
        },
      },
    },
  },
})
