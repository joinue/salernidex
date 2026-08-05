import { useCallback, useRef, useState } from 'react'
import ConfirmDialog from '../components/ui/ConfirmDialog'

// Promise-shaped wrapper around ConfirmDialog, so a destructive handler reads
// the way `window.confirm` did — `if (await confirm({...})) …` — without the
// native OS alert, which on iOS is a grey system sheet with the origin in it,
// in the middle of an app that otherwise looks native.
//
//   const { confirm, dialog } = useConfirm()
//   …
//   onClick={async () => { if (await confirm({ title: 'Delete list?' })) del() }}
//   …
//   return <>{dialog}…</>
//
// State the consequence in `message` rather than asking "are you sure": the
// point of the prompt is what the user is about to lose.
export function useConfirm() {
  const [request, setRequest] = useState(null)
  const resolver = useRef(null)

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolver.current = resolve
        setRequest(opts)
      }),
    [],
  )

  const settle = (answer) => {
    setRequest(null)
    resolver.current?.(answer)
    resolver.current = null
  }

  const dialog = request ? (
    <ConfirmDialog
      {...request}
      confirmLabel={request.confirmLabel || 'Delete'}
      danger={request.danger ?? true}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null

  return { confirm, dialog }
}
