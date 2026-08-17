import { createContext, useContext } from 'react'

// Split out of AccountMenu.jsx so that file exports components only — a module
// mixing a hook with components breaks React Fast Refresh, which the lint rule
// (react-refresh/only-export-components) exists to catch.
export const AccountContext = createContext(null)

// PageHeader calls this and renders the menu itself. Deliberately not a prop:
// there are fifteen PageHeader call sites, and "remember to pass it to all of
// them" is a promise the sixteenth won't keep.
export function useAccount() {
  return useContext(AccountContext)
}
