import { useState } from 'react'
import { ChevronRight, DownloadCloud, Plus, X, Check, Copy, LogOut, Bell } from 'react-feather'
import PageHeader from '../../components/shell/PageHeader'
import Segmented from '../../components/ui/Segmented'
import Avatar from '../../components/ui/Avatar'
import AvatarUpload from '../../components/ui/AvatarUpload'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { supabase } from '../../lib/supabase'
import { useNotificationPrefs } from '../../hooks/useNotificationPrefs'
import { useAppPrefs } from '../../hooks/useAppPrefs'
import { PRIVACY_LABELS } from '../../lib/constants'
import { formatJoinCode } from '../../lib/joinCode'
import {
  pushSupport,
  permissionState,
  deviceEnabled,
  enablePush,
  disablePush,
  sendTestNotification,
  sendRealTestPush,
  testPushMessage,
} from '../../lib/push'
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
  isSolo,
} from '../../lib/household'
import NavBar from '../../components/ui/NavBar'
import SectionLabel from '../../components/ui/SectionLabel'
import IconButton from '../../components/ui/IconButton'

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
function PushSection({ memberId }) {
  const support = pushSupport()
  const [perm, setPerm] = useState(permissionState())
  const [enabled, setEnabled] = useState(deviceEnabled())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)

  if (support === 'ios-install-first') {
    return (
      <p className="muted" style={{ fontSize: 13, margin: '10px 4px 0' }}>
        On iPhone, add DOOT to your Home Screen first (Share → Add to Home Screen) — then
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
      const r = await enablePush(memberId)
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

  // The end-to-end check. Whatever comes back gets reported verbatim-ish through
  // testPushMessage — including the failures, which is the entire reason this
  // sits next to the local one rather than replacing it silently.
  const realTest = async () => {
    setBusy(true)
    setNote(null)
    try {
      setNote(testPushMessage(await sendRealTestPush()))
    } catch (err) {
      setNote(err.message)
    }
    setBusy(false)
  }

  const ready = perm === 'granted' && enabled

  return (
    <div className="list" style={{ marginTop: 12 }}>
      <div className="value-row">
        <Bell size={18} />
        <span className="v-label">This device</span>
        {ready ? (
          <span className="v-value" style={{ color: 'var(--green)' }}>
            Ready — delivery starts at launch
          </span>
        ) : (
          <button className="text-btn" onClick={enable} disabled={busy}>
            {busy ? <span className="dots">Enabling</span> : 'Enable notifications'}
          </button>
        )}
      </div>
      {ready && (
        <>
          <button className="list-row" onClick={realTest} disabled={busy}>
            <div className="row-body">
              <div className="row-sub" style={{ color: 'var(--accent)' }}>
                {busy ? <span className="dots">Sending</span> : 'Send a real test push'}
              </div>
            </div>
          </button>
          <button
            className="list-row"
            onClick={() => sendTestNotification().catch((e) => setNote(e.message))}
          >
            <div className="row-body">
              <div className="row-sub" style={{ color: 'var(--accent)' }}>
                Show a test notification on this device
              </div>
            </div>
          </button>
          <button className="list-row" onClick={disable} disabled={busy}>
            <div className="row-body">
              <div className="row-sub" style={{ color: 'var(--danger)' }}>
                Turn off on this device
              </div>
            </div>
          </button>
        </>
      )}
      {note && (
        <p className="muted" style={{ fontSize: 13, margin: '8px 4px 4px' }}>
          {note}
        </p>
      )}
    </div>
  )
}

function Toggle({ label, sub, on, onChange }) {
  return (
    <div className="value-row">
      <div className="row-body">
        <div className="row-title" style={{ fontSize: 15 }}>
          {label}
        </div>
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

// Demo household: the localStorage model. Members are free-text rows you can
// add/rename/remove, and "I'm this" picks who you are on this device.
function DemoHousehold({ refresh, copied, copyCode }) {
  const household = getHousehold()
  const members = getMembers()
  const meId = currentMemberId()
  const [name, setName] = useState(household.name)
  const [draft, setDraft] = useState('')

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

  return (
    <>
      <SectionLabel>Household</SectionLabel>
      <div className="field">
        <label className="label">Household name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          placeholder="Our Household"
        />
      </div>

      <SectionLabel>Members</SectionLabel>
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
              onBlur={(e) => {
                renameMember(m.id, e.target.value.trim() || m.name)
                refresh()
              }}
            />
            {m.id === meId ? (
              <span className="chip accent">You</span>
            ) : (
              <button
                className="text-btn"
                onClick={() => {
                  setCurrentMember(m.id)
                  refresh()
                }}
              >
                I'm this
              </button>
            )}
            {members.length > 1 && (
              <IconButton
                icon={X}
                variant="danger"
                label={`Remove ${m.name}`}
                onClick={() => {
                  removeMember(m.id)
                  refresh()
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="subtask-add">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a member…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button className="text-btn" onClick={add}>
          <Plus size={14} /> Add
        </button>
      </div>

      <SectionLabel>Invite</SectionLabel>
      <p className="muted" style={{ fontSize: 13, margin: '0 4px 10px' }}>
        Share this code; they join your household with it. (Activates with live accounts.)
      </p>
      <div className="list">
        <div className="value-row">
          <span className="v-label">Join code</span>
          <span className="v-value mono" style={{ letterSpacing: '1px', fontWeight: 600 }}>
            {formatJoinCode(household.join_code)}
          </span>
          <IconButton icon={copied ? Check : Copy} label="Copy code" onClick={copyCode} />
        </div>
        <button
          className="list-row"
          onClick={() => {
            regenerateJoinCode()
            refresh()
          }}
        >
          <div className="row-body">
            <div className="row-sub" style={{ color: 'var(--accent)' }}>
              Generate a new code
            </div>
          </div>
        </button>
      </div>
    </>
  )
}

// Live household: real DB members. You can rename yourself (owners can rename
// anyone), owners can remove others, and members join via the invite code —
// so there's no free-text "add member". Switch households if you're in several.
function LiveHousehold({ household, meId, copied, copyCode }) {
  if (!household) return null
  const members = household.members || []
  const isOwner = members.find((m) => m.id === meId)?.role === 'owner'
  const others = (household.memberships || []).filter(
    (ms) => ms.household_id !== household.householdId,
  )

  return (
    <>
      <SectionLabel>Household</SectionLabel>
      <div className="field">
        <label className="label">Household name</label>
        <input
          defaultValue={household.household?.name || ''}
          onBlur={(e) => household.setName(e.target.value)}
          placeholder="Our Household"
        />
      </div>

      {others.length > 0 && (
        <div className="list" style={{ marginBottom: 18 }}>
          {others.map((ms) => (
            <button
              key={ms.household_id}
              className="list-row"
              onClick={() => household.switchHousehold(ms.household_id)}
            >
              <div className="row-body">
                <div className="row-title">{ms.household_name}</div>
                <div className="row-sub">Switch to this household</div>
              </div>
            </button>
          ))}
        </div>
      )}

      <SectionLabel>Members</SectionLabel>
      <p className="muted" style={{ fontSize: 13, margin: '0 4px 10px' }}>
        Everyone here can be assigned tasks.{' '}
        {isOwner ? 'As the owner you can rename or remove anyone.' : 'You can rename yourself.'}
      </p>
      <div className="list">
        {members.map((m) => {
          const editable = m.id === meId || isOwner
          return (
            <div className="value-row" key={m.id}>
              {m.id === meId ? (
                <AvatarUpload
                  variant="menu"
                  size={30}
                  name={m.name}
                  value={m.avatar_url}
                  entity="people"
                  onChange={(url) => household.setMyAvatar(url)}
                />
              ) : (
                <Avatar name={m.name} size={30} src={m.avatar_url} />
              )}
              {editable ? (
                <input
                  className="member-name-input"
                  defaultValue={m.name}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value.trim() !== m.name)
                      household.renameMember(m.id, e.target.value)
                  }}
                />
              ) : (
                <span className="member-name-input" style={{ alignSelf: 'center' }}>
                  {m.name}
                </span>
              )}
              {m.id === meId && <span className="chip accent">You</span>}
              {m.id !== meId && isOwner && (
                <IconButton
                  icon={X}
                  variant="danger"
                  label={`Remove ${m.name}`}
                  onClick={() => household.removeMember(m.id)}
                />
              )}
            </div>
          )
        })}
      </div>

      <SectionLabel>Invite</SectionLabel>
      <p className="muted" style={{ fontSize: 13, margin: '0 4px 10px' }}>
        Share this code; they create an account and join your household with it.
      </p>
      <div className="list">
        <div className="value-row">
          <span className="v-label">Join code</span>
          <span className="v-value mono" style={{ letterSpacing: '1px', fontWeight: 600 }}>
            {formatJoinCode(household.household?.join_code)}
          </span>
          <IconButton icon={copied ? Check : Copy} label="Copy code" onClick={copyCode} />
        </div>
        <button className="list-row" onClick={() => household.regenerateCode()}>
          <div className="row-body">
            <div className="row-sub" style={{ color: 'var(--accent)' }}>
              Generate a new code
            </div>
          </div>
        </button>
      </div>
    </>
  )
}

// Live-only account controls: the signed-in email, plus the auth actions
// Supabase exposes to the user themselves (password / email changes go through
// auth.updateUser; deletion needs the service role, so it rides the
// delete-account Edge Function). Hidden in demo — there's no auth user there.
function AccountSection({ email }) {
  const [mode, setMode] = useState(null) // null | 'password' | 'email'
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [nextEmail, setNextEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const toggle = (m) => {
    setNote(null)
    setMode((cur) => (cur === m ? null : m))
  }

  const savePassword = async () => {
    setNote(null)
    if (pw.length < 8) return setNote('Use at least 8 characters.')
    if (pw !== pw2) return setNote("Those passwords don't match.")
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setNote(error.message)
    setPw('')
    setPw2('')
    setMode(null)
    setNote('Password updated.')
  }

  const saveEmail = async () => {
    setNote(null)
    const next = nextEmail.trim()
    if (!next || next === email) return setNote('Enter a different email address.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ email: next })
    setBusy(false)
    if (error) return setNote(error.message)
    setNextEmail('')
    setMode(null)
    setNote(
      `Confirmation sent to ${next}. The change takes effect once you confirm from that inbox.`,
    )
  }

  const deleteAccount = async () => {
    setConfirmDelete(false)
    setBusy(true)
    const { error } = await supabase.functions.invoke('delete-account')
    if (error) {
      setBusy(false)
      return setNote(`Couldn't delete the account: ${error.message}`)
    }
    await supabase.auth.signOut() // onAuthStateChange routes back to sign-in
  }

  return (
    <>
      <SectionLabel>Account</SectionLabel>
      <div className="list">
        <div className="value-row">
          <span className="v-label">Email</span>
          <span className="v-value">{email}</span>
        </div>

        <button className="list-row" onClick={() => toggle('password')}>
          <div className="row-body">
            <div className="row-sub" style={{ color: 'var(--accent)' }}>
              Change password
            </div>
          </div>
          <ChevronRight size={18} className="row-chevron" />
        </button>
        {mode === 'password' && (
          <div className="account-form">
            <input
              type="password"
              placeholder="New password"
              value={pw}
              autoComplete="new-password"
              onChange={(e) => setPw(e.target.value)}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={pw2}
              autoComplete="new-password"
              onChange={(e) => setPw2(e.target.value)}
            />
            <button className="text-btn" onClick={savePassword} disabled={busy}>
              {busy ? <span className="dots">Saving</span> : 'Save password'}
            </button>
          </div>
        )}

        <button className="list-row" onClick={() => toggle('email')}>
          <div className="row-body">
            <div className="row-sub" style={{ color: 'var(--accent)' }}>
              Change email
            </div>
          </div>
          <ChevronRight size={18} className="row-chevron" />
        </button>
        {mode === 'email' && (
          <div className="account-form">
            <input
              type="email"
              placeholder="New email address"
              value={nextEmail}
              autoComplete="email"
              onChange={(e) => setNextEmail(e.target.value)}
            />
            <button className="text-btn" onClick={saveEmail} disabled={busy}>
              {busy ? <span className="dots">Sending</span> : 'Send confirmation'}
            </button>
          </div>
        )}

        <button
          className="list-row"
          onClick={() => {
            setNote(null)
            setConfirmDelete(true)
          }}
          disabled={busy}
        >
          <div className="row-body">
            <div className="row-sub" style={{ color: 'var(--danger)' }}>
              Delete account
            </div>
          </div>
          <ChevronRight size={18} className="row-chevron" />
        </button>
      </div>
      {note && (
        <p className="muted" style={{ fontSize: 13, margin: '8px 4px 4px' }}>
          {note}
        </p>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete your account?"
          message="This permanently deletes your login and any household you're the only member of — people, tasks, lists, and habits included. Shared households stay for their other members. It can't be undone; export your data first (below) if you want a copy."
          confirmLabel="Delete account"
          danger
          onConfirm={deleteAccount}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}

// Household + member management. Two backends: demo runs on the localStorage
// household model (add / rename / "I'm this"); live drives DB household_members
// through the useHousehold hook passed in as `household`. meId (the signed-in
// member id) keys notifications + push in both modes.
export default function SettingsView({ go, household, isDemo = false, onLogout, session, onBack }) {
  const [, bump] = useState(0)
  const refresh = () => bump((n) => n + 1)

  const meId = isDemo ? currentMemberId() : household?.memberId
  const [copied, setCopied] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('salernidex-theme') || 'system')
  const [prefs, updatePrefs] = useNotificationPrefs(meId)
  const [appPrefs, updateAppPrefs] = useAppPrefs(meId)

  // Mirror the who-filter on the Tasks page (same member source it uses).
  const taskFilterOptions = [
    { value: 'all', label: 'Everyone' },
    ...getMembers().map((m) => ({ value: m.id, label: m.name })),
  ]

  const joinCode = isDemo ? getHousehold().join_code : household?.household?.join_code
  const copyCode = () => {
    if (!joinCode) return
    navigator.clipboard?.writeText(formatJoinCode(joinCode))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const [confirm, setConfirm] = useState(null) // null | 'leave' | 'delete'

  // Two distinct exits, and exactly one applies:
  //  • Leave — recoverable. You have another household to fall back to, or
  //    co-members who keep the data and can re-invite you.
  //  • Delete — the sole member of your only household. "Leaving" there would
  //    just abandon everything (orphaning the household behind RLS), so we offer
  //    an honest, clean cascade delete instead — a real "start over".
  const activeName = isDemo ? getHousehold().name : household?.household?.name || 'this household'
  const memberCount = isDemo ? getMembers().length : household?.members?.length || 1
  const householdCount = isDemo ? 1 : household?.memberships?.length || 1
  const canLeave = memberCount > 1 || householdCount > 1
  const canDelete = !canLeave // sole member of your only household
  const otherHousehold =
    !isDemo && householdCount > 1
      ? (household?.memberships || []).find((m) => m.household_id !== household?.householdId)
          ?.household_name
      : null

  // Copy reflects the exact case in play, so the dialog never over- or
  // under-states what the action does.
  const leaveCopy = isDemo
    ? {
        title: 'Leave household?',
        message:
          'Demo mode resets this to a fresh household and clears the sample data. Nothing real is affected.',
      }
    : householdCount > 1
      ? {
          title: `Leave ${activeName}?`,
          message: `You'll switch to ${otherHousehold || 'another of your households'}. You can re-join ${activeName} later with its invite code.`,
        }
      : {
          title: `Leave ${activeName}?`,
          message:
            "You'll lose access to this household's shared people, tasks, lists, and habits. The other members keep everything, and you can re-join later with the invite code.",
        }

  const deleteCopy = isDemo
    ? {
        title: 'Delete household?',
        message:
          'Demo mode resets this to a fresh household and clears the sample data. Nothing real is affected.',
      }
    : {
        title: `Delete ${activeName}?`,
        message:
          "This permanently deletes the household and everything in it — people, tasks, lists, and habits. It can't be undone. Export your data first (above) if you want to keep a copy.",
      }

  // Demo has no real membership model: both exits just reset the local sandbox.
  // Live: leave() self-heals the sole-member case into a clean delete; delete is
  // the explicit start-over for the sole member of their only household.
  const runExit = () => {
    const which = confirm
    setConfirm(null)
    if (isDemo) {
      leaveHousehold()
      go('')
    } else if (which === 'delete') {
      household?.deleteHousehold()
    } else {
      household?.leave()
    }
  }

  return (
    <div>
      {onBack ? (
        <NavBar backLabel="Back" onBack={onBack} title="Settings">
          <PageHeader title="Settings" />
        </NavBar>
      ) : (
        <PageHeader title="Settings" />
      )}

      {isDemo ? (
        <DemoHousehold refresh={refresh} copied={copied} copyCode={copyCode} go={go} />
      ) : (
        <LiveHousehold household={household} meId={meId} copied={copied} copyCode={copyCode} />
      )}

      {!isDemo && session?.user?.email && <AccountSection email={session.user.email} />}

      <SectionLabel>Appearance</SectionLabel>
      <Segmented
        options={THEME_OPTIONS}
        value={theme}
        onChange={(t) => {
          setTheme(t)
          applyTheme(t)
        }}
      />

      <SectionLabel>New item visibility</SectionLabel>
      <p className="muted" style={{ fontSize: 13, margin: '0 4px 10px' }}>
        The visibility new items start with. You can still change any item's visibility when you
        create or edit it.
      </p>
      <div className="field">
        <label className="label">New tasks</label>
        <select
          value={appPrefs.taskPrivacy}
          onChange={(e) => updateAppPrefs({ taskPrivacy: e.target.value })}
        >
          {Object.entries(PRIVACY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label">New lists</label>
        <select
          value={appPrefs.listPrivacy}
          onChange={(e) => updateAppPrefs({ listPrivacy: e.target.value })}
        >
          {Object.entries(PRIVACY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label">New people</label>
        <select
          value={appPrefs.personPrivacy}
          onChange={(e) => updateAppPrefs({ personPrivacy: e.target.value })}
        >
          {Object.entries(PRIVACY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <SectionLabel>Tasks view</SectionLabel>
      <p className="muted" style={{ fontSize: 13, margin: '0 4px 10px' }}>
        How the Tasks page opens. Yours alone — other members set their own.
      </p>
      <div className="field">
        <label className="label">Show tasks for</label>
        <Segmented
          options={taskFilterOptions}
          value={appPrefs.taskFilter}
          onChange={(v) => updateAppPrefs({ taskFilter: v })}
        />
      </div>
      <div className="list">
        <Toggle
          label="Show completed by default"
          sub="Start with the Done section expanded"
          on={appPrefs.showCompleted}
          onChange={(v) => updateAppPrefs({ showCompleted: v })}
        />
      </div>

      <SectionLabel>Notifications</SectionLabel>
      <p className="muted" style={{ fontSize: 13, margin: '0 4px 10px' }}>
        What shows in Today's sections and the badge. Yours alone — other members set their own.
      </p>
      {/* Only worth asking once there's someone else to filter out. */}
      {!isSolo() && (
        <div className="field">
          <label className="label">Today shows</label>
          <Segmented
            options={[
              { value: 'mine', label: 'My tasks' },
              { value: 'all', label: 'Everyone’s' },
            ]}
            value={appPrefs.todayScope}
            onChange={(v) => updateAppPrefs({ todayScope: v })}
          />
          <p className="field-hint">
            “My tasks” still includes anything left open to Anyone. This also sets what the badge
            counts and what you get reminded about.
          </p>
        </div>
      )}
      <div className="list">
        <Toggle
          label="Tasks"
          sub="Chores and to-dos that are due or overdue"
          on={prefs.tasks}
          onChange={(v) => updatePrefs({ tasks: v })}
        />
        <Toggle
          label="Lists"
          sub="A list with a due date that's due or overdue"
          on={prefs.lists}
          onChange={(v) => updatePrefs({ lists: v })}
        />
        <Toggle
          label="Habits"
          sub="A habit scheduled for today that you haven't logged"
          on={prefs.habits}
          onChange={(v) => updatePrefs({ habits: v })}
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
        {/* "Household activity" (prefs.fyi) is hidden until partner-activity
            notifications are actually generated — no code produces them yet, so
            the toggle would do nothing. The pref/column stay for when it lands. */}
      </div>
      {prefs.dates && (
        <>
          <p className="muted" style={{ fontSize: 13, margin: '12px 4px 8px' }}>
            Heads-up before a date
          </p>
          <Segmented
            options={LEAD_OPTIONS}
            value={prefs.dates_lead_days}
            onChange={(v) => updatePrefs({ dates_lead_days: v })}
          />
        </>
      )}
      {(prefs.tasks || prefs.nudges || prefs.dates) && (
        <div className="field" style={{ marginTop: 12 }}>
          <label className="label">Daily summary time</label>
          <input
            type="time"
            value={(prefs.digest_time || '08:00').slice(0, 5)}
            onChange={(e) => updatePrefs({ digest_time: e.target.value || '08:00' })}
          />
          <p className="muted" style={{ fontSize: 12, margin: '6px 2px 0' }}>
            When your morning rundown of the day's tasks, check-ins, and dates arrives.
          </p>
        </div>
      )}
      <PushSection memberId={meId} />

      <SectionLabel>Data</SectionLabel>
      <div className="list">
        <button className="list-row" onClick={() => go('import')}>
          <span className="activity-icon">
            <DownloadCloud size={16} />
          </span>
          <div className="row-body">
            <div className="row-title">Import / Export</div>
            <div className="row-sub">Backup, restore, or move your data.</div>
          </div>
          <ChevronRight size={18} className="row-chevron" />
        </button>
      </div>

      <SectionLabel>About</SectionLabel>
      <div className="list">
        <button className="list-row" onClick={() => go('privacy')}>
          <div className="row-body">
            <div className="row-title">Privacy Policy</div>
          </div>
          <ChevronRight size={18} className="row-chevron" />
        </button>
        <button className="list-row" onClick={() => go('terms')}>
          <div className="row-body">
            <div className="row-title">Terms of Use</div>
          </div>
          <ChevronRight size={18} className="row-chevron" />
        </button>
      </div>

      <div className="section-gap" style={{ display: 'flex', gap: 10 }}>
        {onLogout && (
          <button className="pill-btn neutral" onClick={onLogout}>
            <LogOut size={15} /> Log out
          </button>
        )}
        {canLeave && (
          <button className="pill-btn danger" onClick={() => setConfirm('leave')}>
            Leave household
          </button>
        )}
        {canDelete && (
          <button className="pill-btn danger" onClick={() => setConfirm('delete')}>
            Delete household
          </button>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={(confirm === 'delete' ? deleteCopy : leaveCopy).title}
          message={(confirm === 'delete' ? deleteCopy : leaveCopy).message}
          confirmLabel={confirm === 'delete' ? 'Delete' : 'Leave'}
          danger
          onConfirm={runExit}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
