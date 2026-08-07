import { useState } from 'react'

// `id` is optional and exists for the <Field label="Tags">{(id) => …}</Field>
// form, which is the only one that actually wires the label to this input.
export default function TagInput({ tags, onChange, suggestions = [], id }) {
  const [draft, setDraft] = useState('')

  const add = (tag) => {
    const clean = tag.trim()
    if (clean && !tags.includes(clean)) onChange([...tags, clean])
    setDraft('')
  }

  const matches = draft
    ? suggestions.filter((s) => s.toLowerCase().includes(draft.toLowerCase()) && !tags.includes(s))
    : []

  return (
    <div>
      {tags.length > 0 && (
        <div className="pills" style={{ marginBottom: 8 }}>
          {tags.map((t) => (
            <span className="pill" key={t}>
              {t}
              <button
                type="button"
                onClick={() => onChange(tags.filter((x) => x !== t))}
                aria-label={`Remove ${t}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        value={draft}
        placeholder="Type a tag, press Enter"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(draft)
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            onChange(tags.slice(0, -1))
          }
        }}
      />
      {matches.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {matches.slice(0, 6).map((s) => (
            <button
              type="button"
              key={s}
              className="filter-clear"
              style={{
                border: '1px solid var(--divider)',
                borderRadius: 999,
                padding: '2px 10px',
                fontSize: 12,
              }}
              onClick={() => add(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
