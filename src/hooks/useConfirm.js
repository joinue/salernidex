import { createContext, useContext } from 'react'

// Context for the imperative confirm() helper. The provider lives in
// components/ConfirmProvider.jsx (it renders the branded ConfirmDialog); the
// context + hook sit here so the provider file only exports a component
// (keeps fast-refresh happy) and consumers import the hook from one place.
export const ConfirmContext = createContext(null)

export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm must be used inside a ConfirmProvider')
  return confirm
}
