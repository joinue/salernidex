import { useEffect, useState } from 'react'
import { X, Share, Download } from 'react-feather'
import IconButton from '../ui/IconButton'

// Install affordance. Two paths:
//   1. Chrome/Edge (desktop + Android) fire `beforeinstallprompt`; we captured
//      it in main.jsx, so here we show a one-tap "Install" button.
//   2. iOS Safari has no such event, so we show instructions for the Share →
//      "Add to Home Screen" gesture instead.
// Dismissable; gone once installed or running standalone.
const KEY = 'salernidex-install-hint-dismissed'

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true

export default function InstallHint() {
  const [hidden, setHidden] = useState(() => localStorage.getItem(KEY) === '1')
  const [prompt, setPrompt] = useState(() => window.__deferredInstallPrompt || null)

  useEffect(() => {
    const onAvail = () => setPrompt(window.__deferredInstallPrompt || null)
    const onInstalled = () => setPrompt(null)
    window.addEventListener('pwa-installable', onAvail)
    window.addEventListener('pwa-installed', onInstalled)
    return () => {
      window.removeEventListener('pwa-installable', onAvail)
      window.removeEventListener('pwa-installed', onInstalled)
    }
  }, [])

  if (hidden || isStandalone()) return null

  const dismiss = () => {
    localStorage.setItem(KEY, '1')
    setHidden(true)
  }

  const install = async () => {
    if (!prompt) return
    prompt.prompt()
    const choice = await prompt.userChoice.catch(() => null)
    window.__deferredInstallPrompt = null
    setPrompt(null)
    if (choice?.outcome === 'accepted') setHidden(true)
  }

  // Chrome/Edge: real one-tap install.
  if (prompt) {
    return (
      <div className="install-hint">
        <img
          src="/logo-mark.png"
          width="36"
          height="36"
          alt=""
          style={{ borderRadius: 8, flexShrink: 0 }}
        />
        <div className="row-body">
          <div className="row-title" style={{ fontSize: 15 }}>
            Install Salernidex
          </div>
          <div className="row-sub">Its own window and app icon — no browser tab to lose.</div>
        </div>
        <button className="pill-btn" onClick={install}>
          <Download size={15} /> Install
        </button>
        <IconButton icon={X} label="Dismiss" onClick={dismiss} />
      </div>
    )
  }

  // iOS Safari: no install event — show the Add-to-Home-Screen gesture.
  if (isIos()) {
    return (
      <div className="install-hint">
        <img
          src="/logo-mark.png"
          width="36"
          height="36"
          alt=""
          style={{ borderRadius: 8, flexShrink: 0 }}
        />
        <div className="row-body">
          <div className="row-title" style={{ fontSize: 15 }}>
            Add to your Home Screen
          </div>
          {/* Short enough to survive a 375px screen without an ellipsis — the
              old copy truncated mid-word at "and notificat…", which meant it
              was paying for two lines and delivering one. */}
          <div className="row-sub">
            Tap <Share size={12} style={{ verticalAlign: '-1px' }} /> then "Add to Home Screen".
          </div>
        </div>
        <IconButton icon={X} label="Dismiss" onClick={dismiss} />
      </div>
    )
  }

  return null
}
