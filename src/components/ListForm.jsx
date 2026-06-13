import { useState } from 'react'
import Modal from './Modal'
import PrivacyField from './PrivacyField'
import { focusOnDesktop } from '../lib/constants'
import { isSolo } from '../lib/household'
import { PRIVATE_LEVEL } from '../lib/privacy'

const ICONS = ['🛒', '🛍️', '🔧', '🧳', '📝', '🎁', '🏠', '🍽️']

// Create or edit a list (name + an emoji icon for quick recognition).
export default function ListForm({ list, onSave, onClose, defaultPrivacy = 'family_shared' }) {
  const [name, setName] = useState(list?.name || '')
  const [icon, setIcon] = useState(list?.icon || '🛒')
  const [privacy, setPrivacy] = useState(
    list?.privacy_level || (isSolo() ? PRIVATE_LEVEL : defaultPrivacy),
  )
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
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus={focusOnDesktop()}
            placeholder="Groceries, packing, …"
          />
        </div>
        <div className="field">
          <label className="label">Icon</label>
          <div className="icon-row">
            {ICONS.map((ic) => (
              <button
                type="button"
                key={ic}
                className={`icon-pick ${icon === ic ? 'on' : ''}`}
                onClick={() => setIcon(ic)}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>
        <PrivacyField value={privacy} onChange={setPrivacy} />
        <button className="btn-primary" disabled={busy}>
          {busy ? <span className="dots">Saving</span> : list ? 'Save changes' : 'Add list'}
        </button>
      </form>
    </Modal>
  )
}
