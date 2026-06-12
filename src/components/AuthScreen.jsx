import { useState } from 'react'
import { Users, CheckSquare, Sunrise } from 'react-feather'
import { supabase } from '../lib/supabase'

// The no-session screen. On desktop it doubles as a minimal landing page
// (brand hero on the left, auth card on the right); on mobile it collapses to
// a single centered card. One component, several modes:
//   signin · signup · reset · recover (set new password) · sent ("check your inbox")
// `onDemo` enters the in-memory demo (works whether or not Supabase is wired).
// `noAuth` = no backend configured at all, so the only thing to do is the demo.
// `recovery` = arrived via a password-reset link; show the new-password form and
// call `onRecovered` once it's saved (the caller then proceeds into the app).

const VALUE_PROPS = [
  { Icon: Users, title: 'One shared rolodex', body: 'Everyone you both know, with the context that matters.' },
  { Icon: CheckSquare, title: 'Chores, to-dos & projects', body: 'Recurring chores and shared lists, assigned to whoever’s on it.' },
  { Icon: Sunrise, title: 'A single Today', body: 'What’s due, who to check in on, and what’s coming up — together.' },
]

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export default function AuthScreen({ onDemo, noAuth = false, recovery = false, onRecovered }) {
  const [mode, setMode] = useState(recovery ? 'recover' : 'signin') // signin | signup | reset | recover | sent
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(null) // { title, body } for the 'sent' screen

  const reset = (next) => {
    setError(null)
    setPassword('')
    setConfirm('')
    setMode(next)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (noAuth) return onDemo()
    setError(null)

    if (mode === 'reset') {
      if (!emailOk(email)) return setError('Enter a valid email.')
      setBusy(true)
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      setBusy(false)
      if (error) return setError(error.message)
      setSent({ title: 'Check your inbox', body: `We sent a password reset link to ${email}.` })
      return setMode('sent')
    }

    if (mode === 'recover') {
      if (password.length < 6) return setError('Use a password of at least 6 characters.')
      if (password !== confirm) return setError('Passwords don’t match.')
      setBusy(true)
      const { error } = await supabase.auth.updateUser({ password })
      setBusy(false)
      if (error) return setError(error.message)
      setSent({ title: 'Password updated', body: 'Your new password is saved — you’re signed in.' })
      return setMode('sent')
    }

    if (mode === 'signup') {
      if (!emailOk(email)) return setError('Enter a valid email.')
      if (password.length < 6) return setError('Use a password of at least 6 characters.')
      if (password !== confirm) return setError('Passwords don’t match.')
      setBusy(true)
      const { data, error } = await supabase.auth.signUp({ email, password })
      setBusy(false)
      if (error) return setError(error.message)
      // Email-confirmation on: no session yet → tell them to confirm. Off: a
      // session comes back and onAuthStateChange advances us to onboarding.
      if (!data.session) {
        setSent({ title: 'Confirm your email', body: `We sent a confirmation link to ${email}. Open it to finish setting up your account.` })
        setMode('sent')
      }
      return
    }

    // signin
    if (!emailOk(email)) return setError('Enter a valid email.')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(error.message)
  }

  const titles = {
    signin: 'Sign in',
    signup: 'Create your account',
    reset: 'Reset your password',
    recover: 'Choose a new password',
  }

  return (
    <div className="auth-wrap">
      <section className="auth-hero">
        <div className="auth-hero-inner">
          <img className="login-mark" src="/logo-mark.png" alt="" width="56" height="56" />
          <h1 className="auth-hero-title">Salernidex</h1>
          <p className="auth-hero-tag">The shared operating system for your household.</p>
          <ul className="auth-values">
            {VALUE_PROPS.map(({ Icon, title, body }) => (
              <li key={title}>
                <span className="auth-value-icon"><Icon size={18} /></span>
                <div>
                  <div className="auth-value-title">{title}</div>
                  <div className="auth-value-body">{body}</div>
                </div>
              </li>
            ))}
          </ul>
          <p className="auth-hero-by">
            <img src="/joinnovations-badge.png" alt="" width="16" height="16" />
            <span>A Joinnovations product</span>
          </p>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-brand">
            <img className="login-mark" src="/logo-mark.png" alt="" width="44" height="44" />
            <span>Salernidex</span>
          </div>

          {mode === 'sent' ? (
            <div className="auth-sent">
              <h2 className="auth-title">{sent?.title}</h2>
              <p className="muted auth-sub">{sent?.body}</p>
              {recovery ? (
                <button className="btn-primary" onClick={onRecovered}>Continue</button>
              ) : (
                <button className="btn-primary" onClick={() => reset('signin')}>Back to sign in</button>
              )}
            </div>
          ) : noAuth ? (
            <div className="auth-sent">
              <h2 className="auth-title">Live preview</h2>
              <p className="muted auth-sub">This build isn’t connected to an account yet — explore the demo on sample data.</p>
              <button className="btn-primary" onClick={onDemo}>Explore the demo</button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h2 className="auth-title">{titles[mode]}</h2>

              {mode === 'recover' && (
                <p className="muted auth-sub">Pick a new password for your account — you’ll stay signed in.</p>
              )}

              {error && <p className="error-text">{error}</p>}

              {mode !== 'recover' && (
                <div className="field">
                  <label className="label" htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint={mode === 'reset' ? 'send' : 'next'}
                    required
                  />
                </div>
              )}

              {mode !== 'reset' && (
                <div className="field">
                  <div className="field-label-row">
                    <label className="label" htmlFor="password">{mode === 'recover' ? 'New password' : 'Password'}</label>
                    {mode === 'signin' && (
                      <button type="button" className="text-btn quiet auth-inline-link" onClick={() => reset('reset')}>
                        Forgot?
                      </button>
                    )}
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    required
                  />
                </div>
              )}

              {(mode === 'signup' || mode === 'recover') && (
                <div className="field">
                  <label className="label" htmlFor="confirm">Confirm password</label>
                  <input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
              )}

              <button className="btn-primary" disabled={busy}>
                {busy ? (
                  <span className="dots">{mode === 'signin' ? 'Signing in' : mode === 'signup' ? 'Creating account' : mode === 'recover' ? 'Updating' : 'Sending'}</span>
                ) : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'recover' ? 'Update password' : 'Send reset link'}
              </button>

              {(mode === 'signin' || mode === 'signup') && (
                <p className="auth-consent">
                  By {mode === 'signup' ? 'creating an account' : 'continuing'}, you agree to our{' '}
                  <a href="#/terms">Terms of Use</a> and <a href="#/privacy">Privacy Policy</a>.
                </p>
              )}

              {mode !== 'recover' && (
                <div className="auth-switch">
                  {mode === 'signin' && (
                    <span>New here? <button type="button" className="text-btn auth-inline-link" onClick={() => reset('signup')}>Create an account</button></span>
                  )}
                  {mode === 'signup' && (
                    <span>Already have an account? <button type="button" className="text-btn auth-inline-link" onClick={() => reset('signin')}>Sign in</button></span>
                  )}
                  {mode === 'reset' && (
                    <button type="button" className="text-btn auth-inline-link" onClick={() => reset('signin')}>Back to sign in</button>
                  )}
                </div>
              )}
            </form>
          )}

          {mode !== 'sent' && mode !== 'recover' && !noAuth && (
            <>
              <div className="auth-divider"><span>or</span></div>
              <button type="button" className="auth-demo-btn" onClick={onDemo}>Explore the demo</button>
            </>
          )}

          <p className="auth-legal">
            <a href="#/privacy">Privacy Policy</a>
            <span aria-hidden="true"> · </span>
            <a href="#/terms">Terms of Use</a>
          </p>
        </div>
        <p className="auth-card-by">
          <img src="/joinnovations-badge.png" alt="" width="14" height="14" />
          <span>A Joinnovations product</span>
        </p>
      </section>
    </div>
  )
}
