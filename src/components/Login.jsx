import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login({ demo = false, onDemo }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (demo) {
      onDemo()
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={submit}>
        <div className="login-brand">
          <img className="login-mark" src="/logo-mark.png" alt="" width="64" height="64" />
          <h1>Salernidex</h1>
          {demo && (
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Demo mode — enter anything (or nothing) and sign in.
            </p>
          )}
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder={demo ? 'demo@salernidex.app' : ''}
            required={!demo}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder={demo ? '••••••••' : ''}
            required={!demo}
          />
        </div>
        <button className="btn-primary" disabled={busy}>
          {busy ? <span className="dots">Signing in</span> : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
