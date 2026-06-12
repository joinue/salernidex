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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
