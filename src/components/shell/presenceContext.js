import { createContext, useContext } from 'react'

// Errand co-presence, provided once at the Shell so the whole app shares one
// socket. Its own module for the same reason areaLensContext.js is: a file that
// exports both a hook and a component breaks React Fast Refresh.
export const PresenceContext = createContext(null)

// Null whenever there is no household to be co-present in — signed out, or the
// Shell not yet mounted. Every consumer already has to handle "nobody is
// shopping", so "there is no channel" costs them no extra branch.
export function usePresenceContext() {
  return useContext(PresenceContext)
}
