import { useState, useEffect, useRef } from 'react'
import { Users, CheckSquare, Sunrise, List, Activity, Eye, EyeOff } from 'react-feather'
import { supabase } from '../../lib/supabase'
import Wordmark from '../../components/ui/Wordmark'

// The no-session screen. On desktop it doubles as a minimal landing page
// (brand hero on the left, auth card on the right); on mobile it collapses to
// a single centered card. One component, several modes:
//   signin · signup · reset · recover (set new password) · sent ("check your inbox")
// `onDemo` enters the in-memory demo (works whether or not Supabase is wired).
// `noAuth` = no backend configured at all, so the only thing to do is the demo.
// `recovery` = arrived via a password-reset link; show the new-password form and
// call `onRecovered` once it's saved (the caller then proceeds into the app).

const VALUE_PROPS = [
  {
    Icon: Users,
    title: 'One shared rolodex',
    body: 'Everyone you both know, plus the birthdays you swore you’d remember this year.',
  },
  {
    Icon: CheckSquare,
    title: 'Chores, to-dos & projects',
    body: 'Recurring chores and shared lists, each with a name on it. Yours, probably.',
  },
  {
    Icon: Sunrise,
    title: 'A single Today',
    body: 'What’s due, who to check in on, what’s coming up. No more “I thought you had it.”',
  },
]

// Compact value pills for the mobile card (desktop shows the fuller hero
// above). Icons mirror the app nav so the vocabulary is consistent.
const MOBILE_PILLS = [
  { Icon: Users, label: 'Rolodex' },
  { Icon: CheckSquare, label: 'Tasks' },
  { Icon: List, label: 'Lists' },
  { Icon: Activity, label: 'Habits' },
]

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

const MIN_PW = 8

// Supabase auth errors are terse and developer-flavored. Translate the ones
// users actually hit into plain, actionable copy; pass anything else through.
const friendlyError = (message = '', mode) => {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials'))
    return 'That email or password doesn’t match. Try again, or reset your password.'
  if (m.includes('email not confirmed'))
    return 'Confirm your email first. Check your inbox for the link we sent.'
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'An account with this email already exists. Try signing in instead.'
  if (m.includes('user not found'))
    return mode === 'reset' ? 'No account found for that email.' : message
  if (m.includes('rate') || m.includes('security purposes'))
    return 'Too many attempts just now. Wait a moment and try again.'
  return message
}

export default function AuthScreen({ onDemo, noAuth = false, recovery = false, onRecovered }) {
  const [mode, setMode] = useState(recovery ? 'recover' : 'signin') // signin | signup | reset | recover | sent
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [sent, setSent] = useState(null) // { title, body } for the 'sent' screen

  const emailRef = useRef(null)
  const passwordRef = useRef(null)

  // Focus the first actionable field on mount and whenever the form mode
  // changes — recover starts on the password; everything else on email.
  useEffect(() => {
    if (noAuth || mode === 'sent') return
    const el = mode === 'recover' ? passwordRef.current : emailRef.current
    el?.focus()
  }, [mode, noAuth])

  const reset = (next) => {
    setError(null)
    setPassword('')
    setConfirm('')
    setShowPw(false)
    setMode(next)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (noAuth) return onDemo()
    setError(null)

    if (mode === 'reset') {
      if (!emailOk(email)) return setError('Enter a valid email.')
      setBusy(true)
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      setBusy(false)
      if (error) return setError(friendlyError(error.message, mode))
      setSent({ title: 'Check your inbox', body: `We sent a password reset link to ${email}.` })
      return setMode('sent')
    }

    if (mode === 'recover') {
      if (password.length < MIN_PW)
        return setError(`Use a password of at least ${MIN_PW} characters.`)
      if (password !== confirm) return setError('Passwords don’t match.')
      setBusy(true)
      const { error } = await supabase.auth.updateUser({ password })
      setBusy(false)
      if (error) return setError(friendlyError(error.message, mode))
      setSent({
        title: 'Password updated',
        body: 'Your new password is saved, and you’re signed in.',
      })
      return setMode('sent')
    }

    if (mode === 'signup') {
      if (!emailOk(email)) return setError('Enter a valid email.')
      if (password.length < MIN_PW)
        return setError(`Use a password of at least ${MIN_PW} characters.`)
      setBusy(true)
      const { data, error } = await supabase.auth.signUp({ email, password })
      setBusy(false)
      if (error) return setError(friendlyError(error.message, mode))
      // Email-confirmation on: no session yet → tell them to confirm. Off: a
      // session comes back and onAuthStateChange advances us to onboarding.
      if (!data.session) {
        setSent({
          title: 'Confirm your email',
          body: `We sent a confirmation link to ${email}. Open it to finish setting up your account.`,
        })
        setMode('sent')
      }
      return
    }

    // signin
    if (!emailOk(email)) return setError('Enter a valid email.')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(friendlyError(error.message, mode))
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
          <h1 className="auth-hero-title">
            <Wordmark size="full" />
          </h1>
          <p className="auth-hero-tag">
            Things to do? Doot. The shared operating system for your household.
          </p>
          <ul className="auth-values">
            {VALUE_PROPS.map(({ Icon, title, body }) => (
              <li key={title}>
                <span className="auth-value-icon">
                  <Icon size={18} />
                </span>
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
            <span>DOOT</span>
          </div>

          {/* Mobile-only value context — the desktop hero is hidden below 860px,
              so carry the pitch here as a compact tagline + icon strip. */}
          {mode !== 'sent' && (
            <div className="auth-card-pitch">
              <ul className="auth-card-values">
                {MOBILE_PILLS.map(({ Icon, label }) => (
                  <li key={label}>
                    <span className="auth-value-icon">
                      <Icon size={14} />
                    </span>
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mode === 'sent' ? (
            <div className="auth-sent">
              <h2 className="auth-title">{sent?.title}</h2>
              <p className="muted auth-sub">{sent?.body}</p>
              {recovery ? (
                <button className="btn-primary" onClick={onRecovered}>
                  Continue
                </button>
              ) : (
                <button className="btn-primary" onClick={() => reset('signin')}>
                  Back to sign in
                </button>
              )}
            </div>
          ) : noAuth ? (
            <div className="auth-sent">
              <h2 className="auth-title">Live preview</h2>
              <p className="muted auth-sub">
                This build isn’t wired to an account yet. Poke around the demo on sample data
                instead.
              </p>
              <button className="btn-primary" onClick={onDemo}>
                Explore the demo
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h2 className="auth-title">{titles[mode]}</h2>

              {mode === 'recover' && (
                <p className="muted auth-sub">
                  Pick a new password for your account. You’ll stay signed in.
                </p>
              )}

              {error && (
                <p className="error-text" role="alert">
                  {error}
                </p>
              )}

              {mode !== 'recover' && (
                <div className="field">
                  <label className="label" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    ref={emailRef}
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
                    <label className="label" htmlFor="password">
                      {mode === 'recover' ? 'New password' : 'Password'}
                    </label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        className="text-btn quiet auth-inline-link"
                        onClick={() => reset('reset')}
                        disabled={busy}
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                  <div className="pw-input">
                    <input
                      id="password"
                      ref={passwordRef}
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      enterKeyHint={mode === 'signup' ? 'next' : 'go'}
                      required
                    />
                    <button
                      type="button"
                      className="pw-toggle"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      aria-pressed={showPw}
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {mode === 'signup' && (
                    <p className="field-hint">Use at least {MIN_PW} characters.</p>
                  )}
                </div>
              )}

              {mode === 'recover' && (
                <div className="field">
                  <label className="label" htmlFor="confirm">
                    Confirm password
                  </label>
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
                  <span className="dots">
                    {mode === 'signin'
                      ? 'Signing in'
                      : mode === 'signup'
                        ? 'Creating account'
                        : mode === 'recover'
                          ? 'Updating'
                          : 'Sending'}
                  </span>
                ) : mode === 'signin' ? (
                  'Sign in'
                ) : mode === 'signup' ? (
                  'Create account'
                ) : mode === 'recover' ? (
                  'Update password'
                ) : (
                  'Send reset link'
                )}
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
                    <span>
                      New here?{' '}
                      <button
                        type="button"
                        className="text-btn auth-inline-link"
                        onClick={() => reset('signup')}
                        disabled={busy}
                      >
                        Create an account
                      </button>
                    </span>
                  )}
                  {mode === 'signup' && (
                    <span>
                      Already have an account?{' '}
                      <button
                        type="button"
                        className="text-btn auth-inline-link"
                        onClick={() => reset('signin')}
                        disabled={busy}
                      >
                        Sign in
                      </button>
                    </span>
                  )}
                  {mode === 'reset' && (
                    <button
                      type="button"
                      className="text-btn auth-inline-link"
                      onClick={() => reset('signin')}
                      disabled={busy}
                    >
                      Back to sign in
                    </button>
                  )}
                </div>
              )}
            </form>
          )}

          {mode !== 'sent' && mode !== 'recover' && !noAuth && (
            <>
              <div className="auth-divider">
                <span>or</span>
              </div>
              <button type="button" className="auth-demo-btn" onClick={onDemo}>
                Explore the demo
              </button>
            </>
          )}

          {/* The consent line already carries Terms + Privacy on signin/signup;
              show the footer links only on the other screens so they aren't
              listed twice. */}
          {!(!noAuth && (mode === 'signin' || mode === 'signup')) && (
            <p className="auth-legal">
              <a href="#/privacy">Privacy Policy</a>
              <span aria-hidden="true"> · </span>
              <a href="#/terms">Terms of Use</a>
            </p>
          )}
        </div>
        <p className="auth-card-by">
          <img src="/joinnovations-badge.png" alt="" width="14" height="14" />
          <span>A Joinnovations product</span>
        </p>
      </section>
    </div>
  )
}
