import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Search,
  Home,
  CheckSquare,
  List,
  Users,
  Activity,
  Share2,
  Briefcase,
  DownloadCloud,
  Settings,
  Plus,
  Folder,
  CornerDownLeft,
  Clock,
} from 'react-feather'
import {
  buildIndex,
  searchIndex,
  groupResults,
  loadRecents,
  pushRecent,
  highlightSegments,
} from '../lib/quickFind'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useScrollLock } from '../hooks/useScrollLock'
import haptics from '../lib/haptics'
import Avatar from './Avatar'

const NAV_ICONS = {
  '': Home,
  tasks: CheckSquare,
  lists: List,
  people: Users,
  activity: Activity,
  relationships: Share2,
  orgs: Briefcase,
  groups: Users,
  import: DownloadCloud,
  settings: Settings,
}
const TYPE_ICONS = {
  task: CheckSquare,
  project: Folder,
  org: Briefcase,
  group: Users,
  action: Plus,
}

function RowIcon({ entry }) {
  if (entry.type === 'person') return <Avatar name={entry.title} src={entry.avatar_url} size={32} />
  if (entry.type === 'list') return <span className="qf-icon qf-emoji">{entry.icon || '📝'}</span>
  const Icon =
    entry.type === 'nav' ? NAV_ICONS[entry.route] || Home : TYPE_ICONS[entry.type] || Search
  return (
    <span className="qf-icon">
      <Icon size={17} />
    </span>
  )
}

// Global Quick Find: type to search everything (people, tasks, lists, orgs,
// groups, pages, create actions), arrow/enter or tap to jump there. Centered
// palette on desktop, full-screen search on mobile. Empty query shows recents
// and pages.
export default function QuickFind({ data, onPick, onClose }) {
  const isMobile = useMediaQuery('(max-width: 720px)')
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef(null)
  const resultsRef = useRef(null)
  useScrollLock()

  const index = useMemo(() => buildIndex(data), [data])

  const sections = useMemo(() => {
    if (query.trim()) return groupResults(searchIndex(index, query))
    const out = []
    const recents = loadRecents(index)
    if (recents.length) out.push({ type: 'recent', label: 'Recent', items: recents })
    out.push({ type: 'nav', label: 'Pages', items: index.filter((e) => e.type === 'nav') })
    return out
  }, [index, query])

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections])

  const pick = (entry) => {
    pushRecent(entry)
    haptics.light()
    onPick(entry)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSel((s) => (flat.length ? (s + 1) % flat.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSel((s) => (flat.length ? (s - 1 + flat.length) % flat.length : 0))
      } else if (e.key === 'Enter') {
        if (flat[sel]) {
          e.preventDefault()
          pick(flat[sel])
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // `pick` is recreated each render but only forwards to the stable onPick;
    // adding it would needlessly re-bind the key listener every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, sel, onClose])

  // Keep the keyboard selection visible while arrowing through results.
  useEffect(() => {
    resultsRef.current?.querySelector('.qf-row.selected')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  let i = -1 // running index across sections, for selection
  return createPortal(
    <div className="qf-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qf-panel" role="dialog" aria-label="Quick Find">
        <div className="qf-input-row">
          <Search size={18} />
          <input
            ref={inputRef}
            className="qf-input"
            placeholder="Search people, tasks, lists…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSel(0)
            }}
            autoFocus
            enterKeyHint="go"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {isMobile && (
            <button className="qf-cancel" onClick={onClose}>
              Cancel
            </button>
          )}
        </div>

        <div
          className="qf-results"
          ref={resultsRef}
          // iOS: tuck the keyboard away once the user starts browsing results
          onTouchMove={() => inputRef.current?.blur()}
        >
          {flat.length === 0 ? (
            <div className="qf-empty">No matches for “{query.trim()}”</div>
          ) : (
            sections.map((section) => (
              <div key={section.type}>
                <div className="qf-section">
                  {section.type === 'recent' && <Clock size={11} />} {section.label}
                </div>
                {section.items.map((entry) => {
                  i++
                  const idx = i
                  const selected = idx === sel
                  return (
                    <button
                      key={entry.key}
                      className={`qf-row ${selected ? 'selected' : ''}`}
                      onClick={() => pick(entry)}
                      onMouseMove={() => setSel(idx)}
                    >
                      <RowIcon entry={entry} />
                      <div className="qf-row-body">
                        <div className="qf-row-title">
                          {query.trim()
                            ? highlightSegments(entry.title, query).map((seg, j) =>
                                seg.hit ? (
                                  <mark className="qf-mark" key={j}>
                                    {seg.text}
                                  </mark>
                                ) : (
                                  <span key={j}>{seg.text}</span>
                                ),
                              )
                            : entry.title}
                        </div>
                        {entry.sub && <div className="qf-row-sub">{entry.sub}</div>}
                      </div>
                      {selected && !isMobile && (
                        <CornerDownLeft size={14} className="qf-row-enter" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {!isMobile && (
          <div className="qf-footer">
            <span>
              <span className="qf-kbd">↑↓</span> navigate
            </span>
            <span>
              <span className="qf-kbd">↵</span> open
            </span>
            <span>
              <span className="qf-kbd">esc</span> close
            </span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
