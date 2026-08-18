import { useState } from 'react'
import Modal from '../../components/ui/Modal'
import IconPicker from '../../components/ui/IconPicker'
import ColorPicker from '../../components/ui/ColorPicker'
import { COLORS } from '../../lib/colors'
import { focusOnDesktop } from '../../lib/constants'
import { isSolo } from '../../lib/household'
import { useConfirm } from '../../hooks/useConfirm'

// Create or edit an area — the lens: Work, Home, the band.
//
// Name, icon, colour, whether the household shares it, whether new items in it
// start private, and whether it reaches Today. See docs/scopes/areas-and-tags.md
// §5 and §6.
export default function AreaForm({ area, onSave, onClose }) {
  const [name, setName] = useState(area?.name || '')
  const [icon, setIcon] = useState(area?.icon || '')
  const [color, setColor] = useState(area?.color || COLORS[0])
  // Solo households have nobody to share with, so the switch is noise — the same
  // rule PrivacyField and the member filter follow.
  const [shared, setShared] = useState(area?.shared ?? false)
  const [defaultPrivate, setDefaultPrivate] = useState(area?.default_private ?? false)
  // Defaults ON: a new area should behave like everything else until you decide
  // otherwise. Silence is opt-in.
  const [showOnToday, setShowOnToday] = useState(area?.show_on_today ?? true)
  const [isBusiness, setIsBusiness] = useState(area?.is_business ?? false)
  const [error, setError] = useState(null)
  const confirm = useConfirm()

  const submit = async (e) => {
    e.preventDefault()
    // `required` only rejects an empty string, so a name of spaces slips past it
    // and lands as an untitled lens in the switcher.
    const clean = name.trim()
    if (!clean) {
      setError('Give the area a name.')
      return
    }

    // Un-sharing is the one change here with a consequence for somebody else,
    // and it's easy to read as more destructive than it is. Say exactly what
    // happens: the LENS stops being offered to them; the items keep whatever
    // visibility they already had. Nothing becomes private by doing this.
    if (area?.shared && !shared) {
      const ok = await confirm({
        title: `Stop sharing “${clean}”?`,
        message:
          'It disappears from everyone else’s area switcher. Anything already filed in it keeps exactly the visibility it has now — nothing becomes private.',
        confirmLabel: 'Stop sharing',
      })
      if (!ok) return
    }

    onSave({
      name: clean,
      icon: icon || null,
      color,
      shared,
      // Belt and braces with useData's own clearing: the invariant is that the
      // flag only means anything on an unshared area, and the database
      // deliberately holds no constraint saying so (0040 explains why).
      default_private: shared ? false : defaultPrivate,
      show_on_today: showOnToday,
      is_business: isBusiness,
    })
    onClose()
  }

  return (
    <Modal title={area ? 'Edit area' : 'New area'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <p className="error-text">{error}</p>}

        <div className="field">
          <label className="label" htmlFor="area-name">
            Name
          </label>
          <input
            id="area-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            placeholder="Work"
            ref={focusOnDesktop}
            required
          />
        </div>

        {/* Its own field, labelled, exactly as Lists and Habits do it. It was
            sharing the name field's box, where it had no label and no gap — the
            picker is a full row of glyphs plus an expanding panel, so it can't
            sit beside an input the way a single swatch could. */}
        <div className="field">
          <label className="label">Icon</label>
          <IconPicker value={icon} onChange={setIcon} />
        </div>

        <div className="field">
          <label className="label">Colour</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        {!isSolo() && (
          <div className="field">
            <div className="value-row">
              <div className="row-body">
                <div className="row-title" style={{ fontSize: 15 }}>
                  Share with the household
                </div>
                <div className="row-sub">
                  {shared
                    ? 'Everyone sees this area and can file things into it.'
                    : 'Only you see this area. Nobody else is offered it.'}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={shared}
                aria-label="Share with the household"
                className={`switch ${shared ? 'on' : ''}`}
                onClick={() => setShared(!shared)}
              >
                <span className="knob" />
              </button>
            </div>
            {/* Sharing has never controlled who can see the ITEMS inside — that
                is each item's own visibility, exactly as before. Worth saying
                once here, because "shared area" reads like it should. */}
            <p className="field-hint">
              This is about the area itself. What’s filed inside keeps whatever visibility each item
              already has.
            </p>
          </div>
        )}

        {/* Only on an unshared area, and that's the resolution of the fiddliest
            question in this design rather than a layout choice: a shared area
            whose contents default to private is close to a contradiction — you
            shared it so you'd both see what's in it. Hiding the toggle means
            "does my partner's new item in our shared area become invisible to
            me?" never needs an answer. See §5.2. */}
        {!shared && (
          <div className="field">
            <div className="value-row">
              <div className="row-body">
                <div className="row-title" style={{ fontSize: 15 }}>
                  Keep new items private
                </div>
                <div className="row-sub">
                  {defaultPrivate
                    ? 'Anything you file here starts visible only to you.'
                    : 'New items use your usual visibility.'}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={defaultPrivate}
                aria-label="Keep new items private"
                className={`switch ${defaultPrivate ? 'on' : ''}`}
                onClick={() => setDefaultPrivate(!defaultPrivate)}
              >
                <span className="knob" />
              </button>
            </div>
            <p className="field-hint">
              A starting point, not a rule — you can still share any single item. Nothing already
              filed here changes.
            </p>
          </div>
        )}

        {/* The switch that makes areas worth having. Filtering pages is what you
            do while looking at the app; this is what happens when you aren't —
            it reaches Today, both badges, and the push sweep. */}
        <div className="field">
          <div className="value-row">
            <div className="row-body">
              <div className="row-title" style={{ fontSize: 15 }}>
                Show on Today
              </div>
              <div className="row-sub">
                {showOnToday
                  ? 'Dated things here reach Today, the badge and reminders.'
                  : 'Nothing here reaches Today, the badge or reminders. Still on its own pages.'}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showOnToday}
              aria-label="Show on Today"
              className={`switch ${showOnToday ? 'on' : ''}`}
              onClick={() => setShowOnToday(!showOnToday)}
            >
              <span className="knob" />
            </button>
          </div>
          <p className="field-hint">
            Turn it off for work and a Saturday morning stops carrying it — without hiding anything
            you go looking for.
          </p>
        </div>

        {/* The one switch here that changes contacts at all, and it does so
            additively: a contact you file under a business area is OFFERED more
            (client/vendor tiers, weekly check-in cadences) and can go quiet with
            the area on a Saturday. It is never hidden by it. Areas still don't
            filter the People page — see the note under the switcher. */}
        <div className="field">
          <div className="value-row">
            <div className="row-body">
              <div className="row-title" style={{ fontSize: 15 }}>
                This is business
              </div>
              <div className="row-sub">
                {isBusiness
                  ? 'Contacts you know through this area get the business details.'
                  : 'A personal part of your life.'}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isBusiness}
              aria-label="This is business"
              className={`switch ${isBusiness ? 'on' : ''}`}
              onClick={() => setIsBusiness(!isBusiness)}
            >
              <span className="knob" />
            </button>
          </div>
          <p className="field-hint">
            Adds client and vendor labels, weekly check-in options, and lets their follow-ups go
            quiet with the rest of this area. Nobody is ever hidden by it.
          </p>
        </div>

        {/* The commit button, as every other sheet ends: a lone .btn-primary as
            the form's LAST child, which is what modal.css sticks to the foot so
            it can't scroll out of reach. This form was a .form-actions row of
            .btn / .btn.ghost — three class names that exist nowhere in the
            stylesheet, so both buttons rendered as raw browser default buttons
            and the save sat below three switches' worth of scroll.

            No Cancel: Modal already closes on the ✕, on Escape, on the backdrop
            and on a downward drag, and no other form here offers one. */}
        <button className="btn-primary">{area ? 'Save changes' : 'Add area'}</button>
      </form>
    </Modal>
  )
}
