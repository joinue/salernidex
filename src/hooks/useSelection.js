import { useCallback, useEffect, useMemo, useState } from 'react'
import haptics from '../lib/haptics'

// Selection mode, shared by every surface that has one.
//
// State rather than a component so each view keeps its own rows and its own
// actions — the thing worth sharing is the behaviour, which is fiddlier than it
// looks: entering and leaving, the empty-selection edge, keeping the set honest
// when the underlying rows change, and Escape.
//
// `ids` is the visible id list, and it is required rather than optional. Two
// things depend on it: select-all needs to mean "everything you can see", not
// everything that exists; and a row that disappears — checked off by a
// housemate, filtered out by the lens, deleted by this very selection — has to
// leave the selection with it, or a bulk delete would act on rows the user can
// no longer see.
export function useSelection(ids) {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState(() => new Set())

  // One stable key for the visible set, so the prune below reacts to a genuine
  // change of contents rather than to a new array identity every render.
  const key = ids.join(',')

  useEffect(() => {
    const visible = new Set(ids)
    setSelected((prev) => {
      const next = new Set()
      for (const id of prev) if (visible.has(id)) next.add(id)
      // Same size means nothing was pruned — keep the old Set so consumers
      // memoised on it don't re-render.
      return next.size === prev.size ? prev : next
    })
    // `key` is the contents; `ids` is only its carrier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const exit = useCallback(() => {
    setSelecting(false)
    setSelected(new Set())
  }, [])

  // Entering with the row you pressed already ticked. Long-pressing a row and
  // getting an empty selection mode makes you press it a second time to say the
  // thing you already said.
  const enter = useCallback((id) => {
    setSelecting(true)
    haptics.light()
    if (id) setSelected(new Set([id]))
  }, [])

  const toggle = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // The all/none control. "All" means everything currently on screen.
  const allSelected = ids.length > 0 && selected.size === ids.length
  const toggleAll = useCallback(() => {
    setSelected((prev) => (prev.size === ids.length ? new Set() : new Set(ids)))
  }, [ids])

  // Leaving selection mode should be as easy as leaving any other overlay.
  useEffect(() => {
    if (!selecting) return
    const onKey = (e) => {
      if (e.key === 'Escape') exit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecting, exit])

  // Run a bulk action over the selection and leave selection mode.
  //
  // Order is fixed here rather than left to Set iteration so a caller acting on
  // rows in list order gets list order — it matters for a copy, and it costs
  // nothing to guarantee.
  const run = useCallback(
    (fn) => {
      const chosen = ids.filter((id) => selected.has(id))
      if (!chosen.length) return
      fn(chosen)
      exit()
    },
    [ids, selected, exit],
  )

  return useMemo(
    () => ({
      selecting,
      selected,
      count: selected.size,
      allSelected,
      isSelected: (id) => selected.has(id),
      enter,
      exit,
      toggle,
      toggleAll,
      run,
    }),
    [selecting, selected, allSelected, enter, exit, toggle, toggleAll, run],
  )
}
