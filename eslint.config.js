import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

export default [
  // supabase/functions is Deno + TypeScript with its own toolchain — linting it
  // here would need a TS parser, so it's out of scope for the app's flat config.
  { ignores: ['dist', 'node_modules', 'public', 'scripts/shots', 'supabase/functions'] },

  // App source: browser globals, JSX, React + Hooks rules.
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules, // Vite's automatic JSX runtime: no React import needed
      // Classic Rules of Hooks only. react-hooks v7's `recommended-latest` also
      // enables the experimental React-Compiler rules (static-components,
      // set-state-in-effect, etc.); those demand refactors this hand-written
      // React 18 codebase doesn't need, so we stick to the two stable rules.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/prop-types': 'off', // no PropTypes in this codebase
      'react/no-unescaped-entities': 'off', // apostrophes/quotes in copy are intentional
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Tests + Node scripts: add Node + Vitest globals.
  {
    files: ['src/**/*.test.{js,jsx}', 'scripts/**/*.{js,mjs}', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
  },

  // Supabase edge functions run on Deno.
  {
    files: ['supabase/functions/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  prettier, // turn off stylistic rules that Prettier owns — keep this last
]
