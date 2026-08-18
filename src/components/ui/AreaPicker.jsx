import { useState } from 'react'
import { Plus } from 'react-feather'
import Field from './Field'

// Which area a thing is filed under. A chip row, not a text input: areas are
// managed rows now, and typing one on the fly is exactly how "work" and "Work"
// became two areas that could never be merged.
//
// Renders nothing until an area exists — the same progressive-disclosure rule
// PrivacyField and the member filter follow, so someone who never makes an area
// never meets the concept. That's also why callers can drop this in
// unconditionally.
//
// `areas` should already be the ones this user is offered (lib/areas
// visibleAreas): a co-member's private area is not somewhere you can file.
//
// Pass `onCreate(name) -> id` to get the trailing ＋ pill. It's the answer to
// the dead end this control used to have: you're mid-task, the area you want
// doesn't exist yet, and the only way to make one is to abandon the sheet and
// go to Settings. Name only — icon, colour, sharing and the Today switch are
// all things you can decide later in Areas, and none of them are worth a second
// modal while you're still writing down what you have to do.
export default function AreaPicker({
  areas = [],
  value,
  onChange,
  onCreate,
  label = 'Area',
  hint,
}) {
  // The inline name box, open or not. Draft lives here rather than in the
  // parent form: an abandoned half-typed area is not part of what gets saved.
  const [naming, setNaming] = useState(false)
  const [draft, setDraft] = useState('')

  if (areas.length === 0) return null

  const cancel = () => {
    setDraft('')
    setNaming(false)
  }

  const create = () => {
    const clean = draft.trim()
    if (!clean) return cancel()
    // The duplicate guard the comment at the top is about. A name that already
    // exists selects that area instead of minting a second one — case- and
    // space-insensitive, because "Work " and "work" are the pair that actually
    // happens, and once both exist only a merge can undo it.
    const existing = areas.find((a) => a.name?.trim().toLowerCase() === clean.toLowerCase())
    const id = existing ? existing.id : onCreate(clean)
    if (id) onChange(id)
    cancel()
  }

  return (
    <Field label={label} hint={hint ?? 'Which part of your life this belongs to.'}>
      {() => (
        <>
          <div className="area-choices">
            <button
              type="button"
              className={`area-pill ${!value ? 'on' : ''}`}
              onClick={() => onChange(null)}
              aria-pressed={!value}
            >
              None
            </button>
            {areas.map((a) => (
              <button
                type="button"
                key={a.id}
                className={`area-pill ${value === a.id ? 'on' : ''}`}
                onClick={() => onChange(a.id)}
                aria-pressed={value === a.id}
              >
                {a.icon && <span className="area-pill-icon">{a.icon}</span>}
                {a.name}
              </button>
            ))}
            {onCreate && !naming && (
              // An action, not a lens — so it drops the fill and reads as a
              // link, the same way the switcher's Manage does.
              <button
                type="button"
                className="area-pill area-pill-new"
                onClick={() => setNaming(true)}
              >
                <Plus size={12} /> New area
              </button>
            )}
          </div>
          {naming && (
            <div className="area-new-row">
              <input
                value={draft}
                autoFocus
                placeholder="Name it — Work, Home, the band"
                aria-label="New area name"
                enterKeyHint="done"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Both of these are stolen from something bigger: Enter would
                  // submit the form this picker sits inside (saving a
                  // half-written task), and Escape would close the whole sheet
                  // when all you meant to close was this box.
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    create()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    e.stopPropagation()
                    cancel()
                  }
                }}
                // Tapping straight onto a pill or the save button shouldn't
                // lose what you typed — commit on the way out. Except when the
                // tap IS the Add button: focus reaches it before its own click
                // does, so committing here would tear the row down mid-press.
                onBlur={(e) => {
                  if (e.relatedTarget?.closest?.('.area-new-row')) return
                  create()
                }}
              />
              <button type="button" className="text-btn" onClick={create}>
                Add
              </button>
            </div>
          )}
        </>
      )}
    </Field>
  )
}
