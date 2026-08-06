import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Three test surfaces, all colocated with their source and all run by
  // `npm test`:
  //   *.test.js  — pure logic (recurrence, parsing, ordering, privacy …), node
  //   *.test.jsx — primitives with real behaviour, jsdom + Testing Library
  //   *.test.ts  — the pure halves of the Deno Edge Functions, which are ports
  //                of src/lib code and need to stay honest to it, node
  test: {
    include: ['src/**/*.test.{js,jsx}', 'supabase/functions/**/*.test.ts'],
    setupFiles: ['./src/test/setup.js'],
    environmentMatchGlobs: [
      ['src/**/*.test.jsx', 'jsdom'],
      ['supabase/**/*.test.ts', 'node'],
      // notes.test.js gates its sanitizer/mention cases behind describe.runIf
      // (hasDOM). They were silently skipped while everything ran on node —
      // and an HTML sanitizer is precisely the code that wants covering.
      ['src/lib/notes.test.js', 'jsdom'],
      // gestures.js is mostly constants, but swallowNextClick and
      // DRAG_EXEMPT_SELECTOR are DOM behaviour and are tested as such.
      ['src/lib/gestures.test.js', 'jsdom'],
      ['src/**/*.test.js', 'node'],
    ],
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
