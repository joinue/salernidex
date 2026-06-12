import { useState } from 'react'
import { ChevronRight, DownloadCloud, Plus, X, Check, Copy, LogOut, Bell } from 'react-feather'
import PageHeader from './PageHeader'
import Segmented from './Segmented'
import Avatar from './Avatar'
import { useNotificationPrefs } from '../hooks/useNotificationPrefs'
import { pushSupport, permissionState, deviceEnabled, enablePush, disablePush, sendTestNotification } from '../lib/push'
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

const LEAD_OPTIONS = [
  { value: 3, label: '3 days' },
  { value: 7, label: '1 week' },
  { value: 14, label: '2 weeks' },
]

// This-device notification state: permission + (when possible) a real push
// subscription. Delivery starts at go-live; test notifications work today.
function PushSection() {
  const support = pushSupport()
  const [perm, setPerm] = useState(permissionState())
  const [enabled, setEnabled] = useState(deviceEnabled())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)

  if (support === 'ios-install-first') {
    return (
      <p className="muted" style={{ fontSize: 13, margin: '10px 4px 0' }}>
        On iPhone, add Salernidex to your Home Screen first (Share → Add to Home Screen) — then
        notifications can be enabled here.
      </p>
    )
  }
  if (support === 'unsupported') {
    return (
      <p className="muted" style={{ fontSize: 13, margin: '10px 4px 0' }}>
        This browser doesn't support notifications.
      </p>
    )
  }
  if (perm === 'denied') {
    return (
      <p className="muted" style={{ fontSize: 13, margin: '10px 4px 0' }}>
        Notifications are blocked for this site in your browser settings.
      </p>
    )
  }

  const enable = async () => {
    setBusy(true)
    setNote(null)
    try {
      const r = await enablePush(currentMemberId())
      setPerm(r.permission)
      setEnabled(r.permission === 'granted')
      if (r.permission === 'granted' && !r.subscribed) {
        setNote('Allowed. This device will finish registering for delivery at launch.')
      }
    } catch (err) {
      setNote(err.message)
    }
    setBusy(false)
  }

  const disable = async () => {
    setBusy(true)
    await disablePush().catch(() => {})
    setEnabled(false)
    setBusy(false)
  }

  const ready = perm === 'granted' && enabled

  return (
    <div className="list" style={{ marginTop: 12 }}>
      <div className="value-row">
        <Bell size={18} />
        <span className="v-label">This device</span>
        {ready ? (
          <span className="v-value" style={{ color: 'var(--green)' }}>Ready — delivery starts at launch</span>
        ) : (
          <button className="text-btn" onClick={enable} disabled={busy}>
            {busy ? <span className="dots">Enabling</span> : 'Enable notifications'}
          </button>
        )}
      </div>
      {ready && (
        <>
          <button className="list-row" onClick={() => sendTestNotification().catch((e) => setNote(e.message))}>
            <div className="row-body">
              <div className="row-sub" style={{ color: 'var(--accent)' }}>Send a test notification</div>
            </div>
          </button>
          <button className="list-row" onClick={disable} disabled={busy}>
            <div className="row-body">
              <div className="row-sub" style={{ color: 'var(--danger)' }}>Turn off on this device</div>
            </div>
          </button>
        </>
      )}
      {note && <p className="muted" style={{ fontSize: 13, margin: '8px 4px 4px' }}>{note}</p>}
    </div>
  )
}

function Toggle({ label, sub, on, onChange }) {
  return (
    <div className="value-row">
      <div className="row-body">
        <div className="row-title" style={{ fontSize: 15 }}>{label}</div>
        {sub && <div className="row-sub">{sub}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`switch ${on ? 'on' : ''}`}
        onClick={() => onChange(!on)}
      >
        <span className="knob" />
      </button>
    </div>
  )
}

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
  const [prefs, updatePrefs] = useNotificationPrefs(meId)

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

      <div className="section-label">Notifications</div>
      <p className="muted" style={{ fontSize: 13, margin: '0 4px 10px' }}>
        What shows in Today's sections and the badge. Yours alone — other members set their own.
      </p>
      <div className="list">
        <Toggle
          label="Tasks"
          sub="Chores and to-dos that are due or overdue"
          on={prefs.tasks}
          onChange={(v) => updatePrefs({ tasks: v })}
        />
        <Toggle
          label="Check-ins"
          sub="People you haven't caught up with in a while"
          on={prefs.nudges}
          onChange={(v) => updatePrefs({ nudges: v })}
        />
        <Toggle
          label="Birthdays & key dates"
          on={prefs.dates}
          onChange={(v) => updatePrefs({ dates: v })}
        />
        <Toggle
          label="Household activity"
          sub="What others did — included once notifications arrive"
          on={prefs.fyi}
          onChange={(v) => updatePrefs({ fyi: v })}
        />
      </div>
      {prefs.dates && (
        <>
          <p className="muted" style={{ fontSize: 13, margin: '12px 4px 8px' }}>Heads-up before a date</p>
          <Segmented
            options={LEAD_OPTIONS}
            value={prefs.dates_lead_days}
            onChange={(v) => updatePrefs({ dates_lead_days: v })}
          />
        </>
      )}
      <PushSection />

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
