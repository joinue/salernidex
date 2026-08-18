import { createContext, useContext } from 'react'

// The area lens, handed to PageHeader the way the account menu is.
//
// Split into its own module so AccountMenu's neighbours keep exporting
// components only — a module mixing a hook with components breaks React Fast
// Refresh, which react-refresh/only-export-components exists to catch.
export const AreaLensContext = createContext(null)

// PageHeader calls this and renders the switcher under the title. Deliberately
// not a prop: fifteen call sites build a PageHeader, and "remember to pass it
// to all of them" is a promise the sixteenth won't keep — the same reasoning
// accountContext.js records.
//
// App supplies a value only on the routes the lens actually scopes, so a page
// it doesn't apply to (People, Settings, any detail screen) gets nothing by
// having nothing provided, rather than by each page opting out.
export function useAreaLens() {
  return useContext(AreaLensContext)
}
