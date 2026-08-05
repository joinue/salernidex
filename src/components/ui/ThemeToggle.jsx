import { useEffect, useState } from 'react'
import { Monitor, Sun, Moon } from 'react-feather'

const THEMES = [
  { id: 'system', icon: Monitor, text: 'System theme' },
  { id: 'light', icon: Sun, text: 'Light theme' },
  { id: 'dark', icon: Moon, text: 'Dark theme' },
]

export default function ThemeToggle({ className = 'nav-item', iconSize = 18 }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('salernidex-theme') || 'system')

  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
    localStorage.setItem('salernidex-theme', theme)
  }, [theme])

  const current = THEMES.find((t) => t.id === theme) || THEMES[0]
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]
  const Icon = current.icon

  return (
    <button
      className={className}
      onClick={() => setTheme(next.id)}
      title={`Switch to ${next.text.toLowerCase()}`}
    >
      <Icon size={iconSize} />
      <span className="nav-text">{current.text}</span>
    </button>
  )
}
