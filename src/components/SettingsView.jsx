import { useState } from 'react'
import { ChevronRight, DownloadCloud, Plus, X, Check, Copy, LogOut } from 'react-feather'
import PageHeader from './PageHeader'
import Segmented from './Segmented'
import Avatar from './Avatar'
import {
  getHousehold,
  members as getMembers,
  currentMemberId,
  setCurrentMember,
  addMember,
  renameMember,
  removeMember,
  setHouseholdName,
  regenerateJoinCode,
  leaveHousehold,
} from '../lib/household'

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

function applyTheme(t) {
  if (t === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
  localStorage.setItem('salernidex-theme', t)
}

// Household + member management. Members back the assignee model; "You are"
// stands in for the signed-in user until real auth lands. Join code + leave
// mirror the live invite/leave-and-switch flow.
export default function SettingsView({ go }) {
  const [, bump] = useState(0)
  const refresh = () => bump((n) => n + 1)

  const household = getHousehold()
  const members = getMembers()
  const meId = currentMemberId()
  const [name, setName] = useState(household.name)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('salernidex-theme') || 'system')

  const saveName = () => {
    setHouseholdName(name.trim() || 'Our Household')
    refresh()
  }
  const add = () => {
    if (!draft.trim()) return
    addMember(draft)
    setDraft('')
    refresh()
  }
  const copyCode = () => {
    navigator.clipboard?.writeText(household.join_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const leave = () => {
    if (window.confirm('Leave this household? In the live app you can then join another with a code. (Demo: resets to a fresh household.)')) {
      leaveHousehold()
      go('')
    }
  }

  return (
    <div>
      <PageHeader title="Settings" />

      <div className="section-label">Household</div>
      <div className="field">
        <label className="label">Household name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} placeholder="Our Household" />
      </div>

      <div className="section-label">Members</div>
      <p className="muted" style={{ fontSize: 13, margin: '0 4px 10px' }}>
        Anyone here can be assigned tasks. "You are" marks who you are on this device.
      </p>
      <div className="list">
        {members.map((m) => (
          <div className="value-row" key={m.id}>
            <Avatar name={m.name} size={30} />
            <input
              className="member-name-input"
              defaultValue={m.name}
              onBlur={(e) => { renameMember(m.id, e.target.value.trim() || m.name); refresh() }}
            />
            {m.id === meId ? (
              <span className="chip accent">You</span>
            ) : (
              <button className="text-btn" onClick={() => { setCurrentMember(m.id); refresh() }}>I'm this</button>
            )}
            {members.length > 1 && (
              <button className="icon-btn danger" onClick={() => { removeMember(m.id); refresh() }} aria-label={`Remove ${m.name}`}>
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="subtask-add">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a member…"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <button className="text-btn" onClick={add}><Plus size={14} /> Add</button>
      </div>

      <div className="section-label">Invite</div>
      <p className="muted" style={{ fontSize: 13, margin: '0 4px 10px' }}>
        Share this code; they join your household with it. (Activates with live accounts.)
      </p>
      <div className="list">
        <div className="value-row">
          <span className="v-label">Join code</span>
          <span className="v-value mono" style={{ letterSpacing: '1px', fontWeight: 600 }}>{household.join_code}</span>
          <button className="icon-btn" onClick={copyCode} aria-label="Copy code">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
        <button className="list-row" onClick={() => { regenerateJoinCode(); refresh() }}>
          <div className="row-body"><div className="row-sub" style={{ color: 'var(--accent)' }}>Generate a new code</div></div>
        </button>
      </div>

      <div className="section-label">Appearance</div>
      <Segmented options={THEME_OPTIONS} value={theme} onChange={(t) => { setTheme(t); applyTheme(t) }} />

      <div className="section-label">Data</div>
      <div className="list">
        <button className="list-row" onClick={() => go('import')}>
          <span className="activity-icon"><DownloadCloud size={16} /></span>
          <div className="row-body">
            <div className="row-title">Import / Export</div>
            <div className="row-sub">Backup, restore, or move your data.</div>
          </div>
          <ChevronRight size={18} className="row-chevron" />
        </button>
      </div>

      <div className="section-gap">
        <button className="pill-btn danger" onClick={leave}><LogOut size={15} /> Leave household</button>
      </div>
    </div>
  )
}
