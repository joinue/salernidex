import { useState } from 'react'
import { X, Share } from 'react-feather'

// One-time card for iPhones running in Safari: installing to the Home Screen
// is what unlocks full-screen chrome and (at launch) notifications. Gone for
// good once dismissed or once the app is installed.
const KEY = 'salernidex-install-hint-dismissed'

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true

export default function InstallHint() {
  const [hidden, setHidden] = useState(() => localStorage.getItem(KEY) === '1')
  if (hidden || !isIos() || isStandalone()) return null

  return (
    <div className="install-hint">
      <img src="/logo-mark.png" width="36" height="36" alt="" style={{ borderRadius: 8, flexShrink: 0 }} />
      <div className="row-body">
        <div className="row-title" style={{ fontSize: 15 }}>Add to your Home Screen</div>
        <div className="row-sub">
          Full screen, an app icon, and notifications at launch. Tap{' '}
          <Share size={12} style={{ verticalAlign: '-1px' }} /> then "Add to Home Screen".
        </div>
      </div>
      <button
        className="icon-btn"
        aria-label="Dismiss"
        onClick={() => {
          localStorage.setItem(KEY, '1')
          setHidden(true)
        }}
      >
        <X size={16} />
      </button>
    </div>
  )
}
