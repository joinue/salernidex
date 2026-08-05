import { useState } from 'react'
import { Edit3, ChevronLeft } from 'react-feather'
import Modal from '../../components/ui/Modal'
import PrivacyField from '../../components/ui/PrivacyField'
import { PROJECT_TEMPLATES, BLANK_TEMPLATE } from '../../lib/projectTemplates'
import { isSolo } from '../../lib/household'
import { PRIVATE_LEVEL } from '../../lib/privacy'
import { focusOnDesktop } from '../../lib/constants'

// Two-step "New project": pick a template (or Blank), then a light review step
// to name it, set an optional date range, and trim the starter tasks before it
// stamps out. This is the "customization built in" — a power user tweaks here, a
// casual user just hits Create. onCreate(template, opts) hands back everything
// buildProjectRows needs; the parent does the instantiation + navigation.
export default function ProjectTemplatePicker({
  onCreate,
  onClose,
  defaultPrivacy = 'shared',
  initialName = '',
}) {
  const [picked, setPicked] = useState(null) // chosen template → review step

  if (picked) {
    return (
      <ReviewStep
        template={picked}
        onBack={() => setPicked(null)}
        onCreate={onCreate}
        onClose={onClose}
        defaultPrivacy={defaultPrivacy}
        initialName={initialName}
      />
    )
  }

  return (
    <Modal title="New project" onClose={onClose}>
      <div className="template-sheet">
        <button className="template-card blank" onClick={() => setPicked(BLANK_TEMPLATE)}>
          <span className="template-emoji">
            <Edit3 size={18} />
          </span>
          <span className="template-name">Blank project</span>
        </button>
        {PROJECT_TEMPLATES.map((t) => (
          <button key={t.id} className="template-card" onClick={() => setPicked(t)}>
            <span className="template-emoji" aria-hidden="true">
              {t.icon}
            </span>
            <span className="template-name">{t.name}</span>
            <span className="template-sub">
              {t.phases.length} phase{t.phases.length === 1 ? '' : 's'}
              {t.lists.length ? ` · ${t.lists.map((l) => l.name).join(', ')}` : ''}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

function ReviewStep({ template, onBack, onCreate, onClose, defaultPrivacy, initialName = '' }) {
  const blank = template.id === 'blank'
  // A title typed in the task form (before "Project" was chosen) seeds the name;
  // otherwise the template's own name, or blank for a from-scratch project.
  const [name, setName] = useState(initialName || (blank ? '' : template.name))
  const [privacy, setPrivacy] = useState(isSolo() ? PRIVATE_LEVEL : defaultPrivacy)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  // Starter tasks dropped in the review, keyed "phaseIdx:taskIdx". Default: keep
  // all. Phases (headings) always stay — they're the scaffold.
  const [dropped, setDropped] = useState(() => new Set())
  const [busy, setBusy] = useState(false)

  const toggle = (key) =>
    setDropped((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const hasStarters = template.phases.some((p) => (p.tasks || []).length)

  const submit = (e) => {
    e.preventDefault()
    setBusy(true)
    const phases = template.phases.map((p, pi) => ({
      title: p.title,
      tasks: (p.tasks || []).filter((_, ti) => !dropped.has(`${pi}:${ti}`)),
    }))
    onCreate(template, {
      name: name.trim() || template.name,
      privacy_level: privacy,
      start_date: template.dateRange ? startDate || null : null,
      end_date: template.dateRange ? endDate || null : null,
      phases,
      lists: template.lists,
    })
    onClose()
  }

  return (
    <Modal title="New project" onClose={onClose}>
      <form onSubmit={submit}>
        <button type="button" className="text-btn" onClick={onBack} style={{ marginBottom: 10 }}>
          <ChevronLeft size={15} /> Templates
        </button>

        <div className="field">
          <label className="label">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus={focusOnDesktop()}
            placeholder={blank ? 'Kitchen remodel, Italy trip, …' : template.name}
          />
        </div>

        {template.dateRange && (
          <div className="field">
            <label className="label">Dates (optional)</label>
            <div className="due-row" style={{ display: 'flex', gap: 8 }}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="Start date"
              />
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="End date"
              />
            </div>
          </div>
        )}

        {hasStarters && (
          <div className="field">
            <label className="label">Starter tasks</label>
            <p className="muted" style={{ fontSize: 13, margin: '0 2px 8px' }}>
              Tap to drop anything you don’t need — the phases stay either way.
            </p>
            {template.phases.map((p, pi) =>
              (p.tasks || []).length ? (
                <div key={pi}>
                  <div className="section-label" style={{ marginTop: pi ? 8 : 0 }}>
                    {p.title}
                  </div>
                  <div className="chips">
                    {p.tasks.map((t, ti) => {
                      const key = `${pi}:${ti}`
                      const on = !dropped.has(key)
                      return (
                        <button
                          type="button"
                          key={key}
                          className={`chip ${on ? 'accent' : ''}`}
                          aria-pressed={on}
                          onClick={() => toggle(key)}
                        >
                          {t}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null,
            )}
          </div>
        )}

        {template.lists.length > 0 && (
          <p className="muted" style={{ fontSize: 13, margin: '0 2px 14px' }}>
            Adds {template.lists.map((l) => `${l.icon} ${l.name}`).join(', ')}{' '}
            {template.lists.length === 1 ? 'list' : 'lists'}, scoped to this project.
          </p>
        )}

        <PrivacyField value={privacy} onChange={setPrivacy} />
        <button className="btn-primary" disabled={busy || !name.trim()}>
          Create project
        </button>
      </form>
    </Modal>
  )
}
