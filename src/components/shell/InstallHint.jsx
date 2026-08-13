import { useEffect, useState } from 'react'
import { X, Share, Download } from 'react-feather'
import IconButton from '../ui/IconButton'
import { isIos, isStandalone } from '../../lib/platform'

// Install affordance. The icon shown is the manifest icon itself, not a
// stand-in — the prompt is a preview of what ends up on the home screen, so it
// should be the same artwork at the same corner radius.
//
// Two paths:
//   1. Chrome/Edge (desktop + Android) fire `beforeinstallprompt`; we captured
//      it in main.jsx, so here we show a one-tap "Install" button.
//   2. iOS Safari has no such event, so we show instructions for the Share →
//      "Add to Home Screen" gesture instead.
// Dismissable; gone once installed or running standalone.
const KEY = 'salernidex-install-hint-dismissed'

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
          className="install-icon"
          src="/web-app-manifest-192x192.png"
          width="36"
          height="36"
          alt=""
        />
        <div className="row-body">
          <div className="row-title" style={{ fontSize: 15 }}>
            Install DOOT
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
          className="install-icon"
          src="/web-app-manifest-192x192.png"
          width="36"
          height="36"
          alt=""
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
