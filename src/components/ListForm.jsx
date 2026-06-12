import { useState } from 'react'
import Modal from './Modal'
import { PRIVACY_LABELS } from '../lib/constants'

const ICONS = ['🛒', '🛍️', '🔧', '🧳', '📝', '🎁', '🏠', '🍽️']

// Create or edit a list (name + an emoji icon for quick recognition).
export default function ListForm({ list, onSave, onClose }) {
  const [name, setName] = useState(list?.name || '')
  const [icon, setIcon] = useState(list?.icon || '🛒')
  const [privacy, setPrivacy] = useState(list?.privacy_level || 'family_shared')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave({ name, icon, privacy_level: privacy }, list?.id)
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={list ? 'Edit list' : 'New list'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <p className="error-text">{error}</p>}
        <div className="field">
          <label className="label">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="Groceries, packing, …" />
        </div>
        <div className="field">
          <label className="label">Icon</label>
          <div className="icon-row">
            {ICONS.map((ic) => (
              <button type="button" key={ic} className={`icon-pick ${icon === ic ? 'on' : ''}`} onClick={() => setIcon(ic)}>
                {ic}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="label">Visibility</label>
          <select value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
            {Object.entries(PRIVACY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary" disabled={busy}>
          {busy ? <span className="dots">Saving</span> : list ? 'Save changes' : 'Add list'}
        </button>
      </form>
    </Modal>
  )
}
