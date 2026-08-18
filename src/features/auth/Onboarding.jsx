import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { ACTIVE_HOUSEHOLD_KEY } from '../../hooks/useHousehold'
import { stampMemberTimezone } from '../../lib/timezone'
import Segmented from '../../components/ui/Segmented'
import Logo from '../../components/ui/Logo'

// First-run flow for a signed-in user with no household yet: pick a display
// name, then either create a household or join an existing one by invite code.
// Both paths go through the live RPCs (create_household / join_household),
// which return the new membership row.
const MODE_OPTIONS = [
  { value: 'create', label: 'Create a household' },
  { value: 'join', label: 'Join with a code' },
]

export default function Onboarding({ session, onDone, onLogout }) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState('create')
  const [householdName, setHouseholdName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const email = session?.user?.email

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Add your name so your household knows who’s who.')

    setBusy(true)
    let res
    if (mode === 'create') {
      res = await supabase.rpc('create_household', {
        household_name: householdName.trim() || 'Our Household',
        member_name: name.trim(),
      })
    } else {
      // Send the code as-typed (just trimmed); join_household() normalizes case
      // and separators server-side, so this stays correct even if the join-code
      // migration hasn't been applied yet.
      if (!code.trim()) {
        setBusy(false)
        return setError('Enter the invite code you were given.')
      }
      res = await supabase.rpc('join_household', { code: code.trim(), name: name.trim() })
    }
    setBusy(false)

    if (res.error) return setError(res.error.message)
    // join_household() returns NULL for a bad code instead of raising, so the
    // failed-attempt row it just wrote survives (a RAISE would roll the counter
    // back with it). No row means the code didn't match — see migration 0035.
    if (!res.data) return setError('That invite code is not valid.')

    // Stamp the member's timezone from the browser (migration 0036). It decides
    // what "today" means for their reminders and when their morning digest
    // fires, so a member set up in New York must not inherit Arizona's clock.
    //
    // No picker and no prompt: the browser already knows, and asking would be a
    // question with one right answer. Deliberately not awaited into the happy
    // path — a member whose zone didn't stick still gets reminders, just on the
    // default clock, and blocking setup on a preference write would be worse.
    await stampMemberTimezone(res.data.id)

    const hid = res.data?.household_id
    if (hid) localStorage.setItem(ACTIVE_HOUSEHOLD_KEY, hid)
    onDone() // re-loads the household hook → app proceeds into the Shell
  }

  return (
    <div className="auth-wrap">
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-brand">
            <Logo variant="lockup" />
          </div>

          <form onSubmit={submit}>
            <h2 className="auth-title">Set up your household</h2>
            <p className="muted auth-sub">
              A household is your shared space: contacts, tasks, and lists everyone in it can see.
            </p>

            {error && <p className="error-text">{error}</p>}

            <div className="field">
              <label className="label" htmlFor="your-name">
                Your name
              </label>
              <input
                id="your-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What should we call you?"
                autoComplete="name"
                enterKeyHint="next"
                required
              />
            </div>

            <div className="field">
              <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />
            </div>

            {mode === 'create' ? (
              <div className="field">
                <label className="label" htmlFor="household-name">
                  Household name
                </label>
                <input
                  id="household-name"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="Our Household"
                  enterKeyHint="done"
                />
              </div>
            ) : (
              <div className="field">
                <label className="label" htmlFor="join-code">
                  Invite code
                </label>
                <input
                  id="join-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="ABC-123"
                  autoCapitalize="characters"
                  autoComplete="off"
                  enterKeyHint="done"
                />
                <p className="muted" style={{ fontSize: 13, margin: '8px 4px 0' }}>
                  Ask whoever set up your household for their code (Settings → Invite).
                </p>
              </div>
            )}

            <button className="btn-primary" disabled={busy}>
              {busy ? (
                <span className="dots">{mode === 'create' ? 'Creating' : 'Joining'}</span>
              ) : mode === 'create' ? (
                'Create household'
              ) : (
                'Join household'
              )}
            </button>
          </form>

          <div className="auth-switch">
            {email && <span>Signed in as {email} · </span>}
            <button type="button" className="text-btn auth-inline-link" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
