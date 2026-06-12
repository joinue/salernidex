import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Apply saved theme before first paint to avoid a flash
const savedTheme = localStorage.getItem('salernidex-theme')
if (savedTheme === 'light' || savedTheme === 'dark') {
  document.documentElement.dataset.theme = savedTheme
}

// Service worker: push display + notification click-through (no caching).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

// Capture the install prompt globally — it can fire before any component that
// wants it (InstallHint) has mounted (e.g. while still on the auth screen).
// Stash it on window + announce it so the hint can offer an Install button.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__deferredInstallPrompt = e
  window.dispatchEvent(new Event('pwa-installable'))
})
window.addEventListener('appinstalled', () => {
  window.__deferredInstallPrompt = null
  window.dispatchEvent(new Event('pwa-installed'))
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
