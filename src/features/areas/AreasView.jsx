import { useMemo, useState } from 'react'
import {
  Archive,
  CornerUpRight,
  Edit2,
  Grid,
  Plus,
  Trash2,
  RotateCcw,
  GitMerge,
} from 'react-feather'
import PageHeader from '../../components/shell/PageHeader'
import NavBar from '../../components/ui/NavBar'
import EmptyState from '../../components/ui/EmptyState'
import SwipeRow from '../../components/ui/SwipeRow'
import ReorderableList from '../../components/ui/ReorderableList'
import SectionLabel from '../../components/ui/SectionLabel'
import ActionSheet from '../../components/ui/ActionSheet'
import { useConfirm } from '../../hooks/useConfirm'
import { moveUpdates } from '../../lib/order'
import { sortAreas, visibleAreas } from '../../lib/areas'

// Managing the lens: create, rename, recolour, reorder, merge, archive, delete.
//
// Reached from Settings, and (once the switcher lands) from its overflow —
// people manage things where they see them. Deliberately not a nav destination:
// you come here to tidy up, not to work.
export default function AreasView({ data, onAdd, onEdit, onBack }) {
  const { areas, tasks, lists, notes, habits, userId } = data
  const { reorderAreas, archiveArea, unarchiveArea, deleteArea, mergeAreas, moveAreaItems } = data
  const confirm = useConfirm()
  // The area whose contents are going somewhere, and which of the two ways.
  // `merge` empties it and deletes it; `move` empties it and leaves it standing,
  // which is the only one that makes sense for an archived area. One piece of
  // state because they share the whole flow — pick a destination, confirm, go.
  const [picking, setPicking] = useState(null) // { area, mode: 'merge' | 'move' }
  const [showArchived, setShowArchived] = useState(false)

  // What each area holds, so a row can say what deleting it would unfile and
  // the confirm copy can be specific rather than ominous.
  const counts = useMemo(() => {
    const m = new Map()
    const tally = (rows) => {
      for (const r of rows || []) {
        if (!r.area_id) continue
        m.set(r.area_id, (m.get(r.area_id) || 0) + 1)
      }
    }
    tally(tasks)
    tally(lists)
    tally(notes)
    tally(habits)
    return m
  }, [tasks, lists, notes, habits])

  const active = useMemo(() => visibleAreas(areas, userId), [areas, userId])
  const archived = useMemo(() => sortAreas((areas || []).filter((a) => a.archived_at)), [areas])

  // `action`, not `createAction`: PageHeader drops a createAction on a phone
  // because the bottom bar's ＋ already offers that page's create — and this is
  // the one page carrying a createAction that has no bar (BARLESS_ROUTES), so
  // the header was handing its create to a button that isn't there. Below the
  // empty state, a phone had no way to make an area at all.
  const header = {
    title: 'Areas',
    subtitle: 'Which part of your life something belongs to',
    action: onAdd,
    actionLabel: 'New area',
  }

  const countLabel = (id) => {
    const n = counts.get(id) || 0
    return n === 0 ? 'Nothing filed here yet' : `${n} item${n === 1 ? '' : 's'}`
  }

  const askDelete = async (a) => {
    const n = counts.get(a.id) || 0
    const ok = await confirm({
      title: `Delete “${a.name}”?`,
      // Say what happens to the contents, because "delete" next to a count of
      // 14 reads like it takes the 14 with it. It never does.
      message: n
        ? `Its ${n} item${n === 1 ? '' : 's'} move to No area. Nothing is deleted. The area itself is gone.`
        : 'The area is removed. Nothing else changes.',
      confirmLabel: 'Delete area',
      danger: true,
    })
    if (ok) deleteArea(a.id)
  }

  const askMove = async (into) => {
    const { area: from, mode } = picking || {}
    setPicking(null)
    if (!from || from.id === into.id) return
    const n = counts.get(from.id) || 0
    const items = `${n} item${n === 1 ? '' : 's'}`

    if (mode === 'merge') {
      const ok = await confirm({
        title: `Merge “${from.name}” into “${into.name}”?`,
        message: `${n ? `${items} move to ${into.name}. ` : ''}“${from.name}” is then deleted. This needs a connection and can’t be undone.`,
        confirmLabel: 'Merge',
        danger: true,
      })
      if (ok) await mergeAreas(from.id, into.id)
      return
    }

    // Not destructive and not online-only, so it says neither — the copy's whole
    // job here is to be clear that the archived area survives this. Somebody
    // emptying one is usually tidying up, not getting rid of it.
    const ok = await confirm({
      title: `Move ${items} to “${into.name}”?`,
      message: `They start showing under ${into.name}. “${from.name}” stays archived, now with nothing in it.`,
      confirmLabel: 'Move items',
    })
    if (ok) moveAreaItems(from.id, into.id)
  }

  const rowActions = (a) => [
    { label: 'Edit', icon: Edit2, onClick: () => onEdit(a) },
    // Merge only makes sense with somewhere to merge into.
    ...(active.length > 1
      ? [{ label: 'Merge', icon: GitMerge, onClick: () => setPicking({ area: a, mode: 'merge' }) }]
      : []),
    { label: 'Archive', icon: Archive, onClick: () => archiveArea(a.id) },
    { label: 'Delete', icon: Trash2, variant: 'danger', onClick: () => askDelete(a) },
  ]

  return (
    <div>
      {onBack ? (
        <NavBar backLabel="Settings" onBack={onBack} title="Areas">
          <PageHeader {...header} />
        </NavBar>
      ) : (
        <PageHeader {...header} />
      )}

      {active.length === 0 && archived.length === 0 ? (
        <EmptyState
          icon={Grid}
          action={
            <button className="text-btn" onClick={onAdd}>
              <Plus size={14} /> New area
            </button>
          }
        >
          No areas yet. Make one for work and one for home, and the two stop landing in the same
          list.
        </EmptyState>
      ) : (
        <ReorderableList
          items={active}
          onMove={(from, to) => reorderAreas(moveUpdates(active, from, to))}
          renderItem={(a) => (
            // Tapping the row edits it, as every other row of this shape does
            // (Lists opens the list; an area has no page of its own, so its
            // editor IS where the row goes). Without it the swipe was the only
            // route to Edit, and a swipe is not a thing you find by looking.
            <SwipeRow key={a.id} label={a.name} onClick={() => onEdit(a)} actions={rowActions(a)}>
              <div className="list-row area-row">
                <span className="list-emoji" style={a.color ? { background: a.color } : undefined}>
                  {a.icon || a.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="row-body">
                  <div className="row-titleline">
                    <div className="row-title">{a.name}</div>
                  </div>
                  <div className="row-sub">
                    {countLabel(a.id)}
                    {a.shared && <span className="chip area-chip-shared">Shared</span>}
                  </div>
                </div>
              </div>
            </SwipeRow>
          )}
        />
      )}

      {archived.length > 0 && (
        <>
          <SectionLabel
            action={
              <button className="text-btn" onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? 'Hide' : 'Show'}
              </button>
            }
          >
            Archived · {archived.length}
          </SectionLabel>
          {showArchived && (
            <div className="list">
              {archived.map((a) => (
                <div className="list-row area-row is-archived" key={a.id}>
                  <span className="list-emoji">{a.icon || a.name.slice(0, 1).toUpperCase()}</span>
                  <div className="row-body">
                    <div className="row-title">{a.name}</div>
                    {/* An archived area hides a lens, never an item — its things
                        are still there under All. Say so, or the count reads
                        like they went with it. */}
                    <div className="row-sub">{countLabel(a.id)} · still visible under All</div>
                  </div>
                  {/* The way out of the trap the line above describes. An
                      archived area's things are reachable only on All, so
                      unarchiving is not the only answer somebody wants — often
                      the area is done with and its leftovers belong somewhere
                      that's still in use. Only when there is something to move
                      and somewhere to put it. */}
                  {(counts.get(a.id) || 0) > 0 && active.length > 0 && (
                    <button
                      className="text-btn"
                      onClick={() => setPicking({ area: a, mode: 'move' })}
                      aria-label={`Move the items in ${a.name} to another area`}
                    >
                      <CornerUpRight size={14} /> Move items
                    </button>
                  )}
                  <button
                    className="text-btn"
                    onClick={() => unarchiveArea(a.id)}
                    aria-label={`Unarchive ${a.name}`}
                  >
                    <RotateCcw size={14} /> Unarchive
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {picking && (
        <ActionSheet
          title={
            picking.mode === 'merge'
              ? `Merge “${picking.area.name}” into…`
              : `Move everything in “${picking.area.name}” to…`
          }
          onClose={() => setPicking(null)}
          actions={active
            .filter((a) => a.id !== picking.area.id)
            .map((a) => ({
              label: a.name,
              onClick: () => askMove(a),
            }))}
        />
      )}
    </div>
  )
}
