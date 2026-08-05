import { useCallback, useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { ConfirmContext } from '../../hooks/useConfirm'

// Imperative wrapper around the branded ConfirmDialog so inline handlers can do
//   if (await confirm({ title, message, danger: true })) deleteThing()
// instead of reaching for the OS window.confirm (which can't be themed and
// breaks the iOS look). Components that already manage their own confirm state
// keep rendering <ConfirmDialog> directly — this just covers the one-off,
// fire-from-a-handler cases. One dialog at a time is plenty for this app.
export function ConfirmProvider({ children }) {
  const [opts, setOpts] = useState(null)
  const resolverRef = useRef(null)

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        resolverRef.current = resolve
        setOpts(typeof options === 'string' ? { title: options } : options)
      }),
    [],
  )

  const settle = (result) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setOpts(null)
    resolve?.(result)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <ConfirmDialog {...opts} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
      )}
    </ConfirmContext.Provider>
  )
}
