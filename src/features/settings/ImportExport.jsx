import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { Download, Upload, Database, FileText, RotateCcw } from 'react-feather'
import PageHeader from '../../components/shell/PageHeader'
import Segmented from '../../components/ui/Segmented'
import { useConfirm } from '../../hooks/useConfirm'
import { memberNames, setMemberNames } from '../../lib/household'
import { getAllPrefs, setAllPrefs } from '../../lib/notifyPrefs'
import { getAllAppPrefs, setAllAppPrefs } from '../../lib/appPrefs'
import { downloadVcf, parseVcf } from '../../lib/vcard'
import { leadAffiliation } from '../../lib/orgs'
import { localDay } from '../../lib/contact'
import { findDuplicates } from '../../lib/duplicates'
import SectionLabel from '../../components/ui/SectionLabel'

// Bump when the backup shape changes so future imports can migrate if needed.
// v3: adds families, key_dates, and people.tier/family_id (Phase 7).
// v4: adds reminder_snoozes + settings.notifications (Phase 6a).
// v5: adds settings.preferences (per-member default visibility + Tasks view).
// v6: adds avatar_url on people/orgs/groups. The value is a Storage object path
//     scoped to the household, so it round-trips within the same household; a
//     cross-household restore would lose the image (path RLS won't match).
// v7: people reference orgs by organization_id (was the free-text `organization`
//     name). Restoring a v<=6 backup find-or-creates orgs from the old string
//     (see useData.restoreBackup).
// v8: adds habits + habit_entries (personal habit tracking). Additive — older
//     backups simply restore without them.
// v9: privacy level 'marc_only' renamed to 'private' (migration 0023). Older
//     backups restore fine — useData.restoreBackup maps the old label across.
// v10: people ↔ organizations is many-to-many via `affiliations` (migration
//     0033), which also carries the role. people.organization_id is gone and
//     people.role is now only the standalone descriptor. Restoring a v<=9
//     backup turns each organization_id into a primary affiliation (see
//     useData.restoreBackup). Also adds org contact fields (0032), which ride
//     along inside the organizations rows.
// v11: adds `areas` (migration 0040) and the area_id each task/list/note/habit
//     carries. Areas restore BEFORE anything that references them, and an
//     incoming area whose name collides with an existing one folds into it with
//     every area_id rewritten (see useData.restoreBackup).
//     Also fixes a v8–v10 defect: `notes` was read by restoreBackup but never
//     written here, so every backup taken in that range silently dropped the
//     entire notebook. Those backups cannot be recovered from — the data was
//     never in the file — but from v11 the notebook round-trips.
// v12: contacts and orgs carry `context_area_id`, areas carry `is_business`, and
//     `interactions` may name an organization instead of a person (migration
//     0042). Every one of those is a column on a row this file already copies
//     wholesale, so nothing here changed except the number — the version exists
//     to tell a v11 reader that an interaction with a null person_id is expected
//     rather than corrupt. Restoring a v<=11 backup is unaffected: its contacts
//     have no context and its touchpoints all name a person, which is exactly
//     what they meant.
const BACKUP_VERSION = 12

const SCHEMA_FIELDS = [
  '',
  'name',
  'organization',
  'role',
  'email',
  'phone',
  'additional_emails',
  'additional_phones',
  'socials',
  'birthday',
  'address',
  'tier',
  'tags',
  'notes',
]

// Friendlier labels for the column-mapping dropdown; falls back to the raw
// field name for anything not listed.
const FIELD_LABELS = {
  additional_emails: 'more emails',
  additional_phones: 'more phones',
  socials: 'social profiles',
}

// CSV holds one row per person, so the labeled multi-value channels (extra
// emails/phones, socials) are packed as "label: value; label: value" — the same
// human-readable, spreadsheet-friendly convention `tags` uses. These pack/parse
// helpers keep a CSV round-trip lossless.
const packChannels = (items, field) =>
  (items || []).map((it) => `${it[field]}: ${it.value}`).join('; ')

const parseChannels = (value, field, fallback) =>
  String(value)
    .split(';')
    .map((part) => {
      const t = part.trim()
      if (!t) return null
      const idx = t.indexOf(':')
      if (idx === -1) return { [field]: fallback, value: t }
      return { [field]: t.slice(0, idx).trim() || fallback, value: t.slice(idx + 1).trim() }
    })
    .filter((x) => x && x.value)

// Auto-map CSV headers to schema fields by loose name match
function guessField(header) {
  const h = header.toLowerCase().replace(/[^a-z]/g, '')
  if (h.includes('name')) return 'name'
  if (h.includes('org') || h.includes('company')) return 'organization'
  if (h.includes('role') || h.includes('title') || h.includes('position')) return 'role'
  // Check the "additional"/social columns before the generic email/phone match,
  // since "additionalemails" also contains "email".
  if (h.includes('additionalemail') || h.includes('moreemail') || h.includes('otheremail'))
    return 'additional_emails'
  if (h.includes('additionalphone') || h.includes('morephone') || h.includes('otherphone'))
    return 'additional_phones'
  if (h.includes('social') || h.includes('linkedin') || h.includes('instagram') || h === 'urls')
    return 'socials'
  if (h.includes('email') || h.includes('mail')) return 'email'
  if (h.includes('phone') || h.includes('mobile') || h.includes('cell')) return 'phone'
  if (h.includes('birth') || h.includes('bday') || h === 'dob') return 'birthday'
  if (h.includes('address') || h.includes('street')) return 'address'
  if (h.includes('tier') || h.includes('circle')) return 'tier'
  if (h.includes('tag') || h.includes('label') || h.includes('group')) return 'tags'
  if (h.includes('note') || h.includes('comment') || h.includes('context')) return 'notes'
  return ''
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Defer the revoke so large downloads (full JSON backup) aren't cancelled
  // before the browser reads the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function ImportExport({ data }) {
  const {
    people,
    orgs,
    relationships,
    interactions,
    groups,
    affiliations,
    completions,
    taskLinks,
    families,
    keyDates,
    reminderSnoozes,
    listCatalog,
    areas,
    importPeople,
    restoreBackup,
    fetchFullTable,
  } = data
  // Backup is lossless on purpose: it uses the unfiltered all* arrays, so
  // "Private — only me" rows survive the round-trip. CSV/vCard exports use
  // the filtered arrays above — they only ever contain what YOU can see.
  const { allPeople, allOrgs, allTasks, allLists, allListItems, allHabits, allHabitEntries } = data
  // allNotes, not notes: the filtered array hides both private rows and anything
  // in Recently Deleted, and a backup that quietly drops either isn't lossless.
  const { allNotes } = data
  const confirm = useConfirm()
  const csvRef = useRef(null)
  const jsonRef = useRef(null)
  const vcfRef = useRef(null)
  const [parsed, setParsed] = useState(null) // { headers, rows }
  const [mapping, setMapping] = useState({})
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState(null) // { records: [{rec, matches, action}] }

  const active = people.filter((p) => !p.deleted_at)
  // CSV and vCard are one-org-per-person formats, so the string exports carry
  // the lead affiliation — the same one shown under the person's name. The full
  // set survives in the JSON backup's `affiliations`.
  const orgsById = new Map(orgs.map((o) => [o.id, o]))
  const leadFor = (p) => leadAffiliation(p.id, affiliations, orgsById)
  const orgName = (p) => orgsById.get(leadFor(p)?.organization_id)?.name || ''
  const roleName = (p) => leadFor(p)?.role || p.role || ''

  // ---- Full backup (everything, round-trippable) ----
  // Async because of task_completions: the app reads only a recent window of it
  // (RECENT_LOG_DAYS in lib/tables.js — the check-off log is the one table with
  // no natural ceiling), and a backup that carried only that window would
  // silently drop years of history. So the export pulls that table in full
  // first, and falls back to the in-memory window if the read fails — a backup
  // missing old completions still beats no backup at all.
  const exportBackup = async () => {
    const fullCompletions = (await fetchFullTable?.('completions')) || completions
    const backup = {
      app: 'doot',
      backup_version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      people: allPeople, // includes soft-deleted + private, so restore is lossless
      organizations: allOrgs,
      affiliations,
      relationships,
      interactions,
      families,
      key_dates: keyDates,
      groups,
      tasks: allTasks,
      task_completions: fullCompletions,
      task_links: taskLinks,
      lists: allLists,
      list_items: allListItems,
      reminder_snoozes: reminderSnoozes,
      habits: allHabits,
      habit_entries: allHabitEntries,
      list_catalog: listCatalog, // rebuildable autocomplete cache; included so the backup is complete
      notes: allNotes, // v11 — restoreBackup has always read these; nothing wrote them
      areas: areas || [], // v11 — the lens every area_id above points at
      settings: {
        members: memberNames(),
        notifications: getAllPrefs(),
        preferences: getAllAppPrefs(),
      },
    }
    const stamp = new Date().toISOString().slice(0, 10)
    download(`doot-backup-${stamp}.json`, JSON.stringify(backup, null, 2), 'application/json')
  }

  const onBackupFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setStatus(null)
    const reader = new FileReader()
    reader.onload = async () => {
      let backup
      try {
        backup = JSON.parse(reader.result)
      } catch {
        setStatus('That file is not valid JSON.')
        return
      }
      // 'salernidex' is the pre-rebrand tag — keep accepting it so older backups restore.
      const known = backup.app === 'doot' || backup.app === 'salernidex'
      if (!known || !Array.isArray(backup.people)) {
        setStatus('This does not look like a DOOT backup.')
        return
      }
      const counts = [
        'people',
        'organizations',
        'relationships',
        'interactions',
        'families',
        'key_dates',
        'groups',
        'tasks',
        'task_completions',
        'task_links',
        'lists',
        'list_items',
        'reminder_snoozes',
        'habits',
        'habit_entries',
      ]
        .map((k) => (backup[k] || []).length)
        .reduce((a, b) => a + b, 0)
      const ok = await confirm({
        title: `Restore ${counts} records?`,
        message:
          'Existing records with the same id are overwritten; everything else is kept. Export a backup first if you want a safety copy.',
        confirmLabel: 'Restore',
        danger: true,
      })
      if (!ok) return
      setBusy(true)
      try {
        await restoreBackup(backup)
        if (backup.settings?.members) setMemberNames(backup.settings.members)
        if (backup.settings?.notifications) setAllPrefs(backup.settings.notifications)
        if (backup.settings?.preferences) setAllAppPrefs(backup.settings.preferences)
        setStatus(`Restored backup from ${backup.exported_at?.slice(0, 10) || 'file'}.`)
      } catch (err) {
        setStatus(`Restore failed: ${err.message}`)
      }
      setBusy(false)
    }
    reader.readAsText(file)
  }

  // ---- CSV (people only, for moving between tools) ----
  // Spreadsheet formula injection guard: a field starting with = + - @ would
  // execute as a formula when the CSV opens in Excel/Sheets. Prefix with an
  // apostrophe (the spreadsheet convention for "literal text") — except
  // phone-shaped values, so "+1 520…" numbers stay clean.
  const PHONE_SHAPE = /^\+?[\d\s().-]+$/
  const csvSafe = (value) => {
    const s = String(value ?? '')
    if (/^[=+\-@\t\r]/.test(s) && !PHONE_SHAPE.test(s)) return `'${s}`
    return s
  }

  const exportCsv = () => {
    const csv = Papa.unparse(
      active.map((p) => ({
        name: csvSafe(p.name),
        organization: csvSafe(orgName(p)),
        role: csvSafe(roleName(p)),
        email: csvSafe(p.email || ''),
        phone: csvSafe(p.phone || ''),
        additional_emails: csvSafe(packChannels(p.emails, 'label')),
        additional_phones: csvSafe(packChannels(p.phones, 'label')),
        socials: csvSafe(packChannels(p.socials, 'platform')),
        birthday: p.birthday || '',
        address: csvSafe(p.address || ''),
        tier: p.tier || '',
        tags: csvSafe((p.tags || []).join('; ')),
        keep_in_touch_days: p.keep_in_touch_days || '',
        privacy_level: p.privacy_level,
        notes: csvSafe(p.notes || ''),
      })),
    )
    download('doot-people.csv', csv, 'text/csv')
  }

  // The history, as its own file. The people CSV is one row per contact and has
  // nowhere to put a log; until 0042 that meant touchpoints left the app only
  // inside the JSON backup, which is the right format for restoring the app and
  // the wrong one for handing a year of client contact to an accountant.
  //
  // One row per touchpoint, with the subject named rather than referenced —
  // a uuid is meaningless in a spreadsheet. Archived contacts are included:
  // this is a record of what happened, and it happened.
  const exportInteractionsCsv = () => {
    const nameOf = (it) => {
      if (it.organization_id) return orgsById.get(it.organization_id)?.name || ''
      return allPeople.find((p) => p.id === it.person_id)?.name || ''
    }
    const rows = [...interactions]
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
      .map((it) => ({
        date: csvSafe(localDay(it.occurred_at) || ''),
        who: csvSafe(nameOf(it)),
        kind: csvSafe(it.organization_id ? 'organization' : 'person'),
        type: csvSafe(it.type || ''),
        note: csvSafe(it.note || ''),
      }))
    download('doot-touchpoints.csv', Papa.unparse(rows), 'text/csv')
  }

  const onCsvFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus(null)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields || []
        setParsed({ headers, rows: result.data })
        setMapping(Object.fromEntries(headers.map((h) => [h, guessField(h)])))
      },
      error: (err) => setStatus(`Could not read file: ${err.message}`),
    })
    e.target.value = ''
  }

  // Turn mapped CSV rows into person records, then check each against the people
  // you already have. Rows with a likely match default to "skip"; the rest to
  // "import". If nothing is flagged we import straight away — no extra step.
  const runImport = async () => {
    const nameColumn = Object.entries(mapping).find(([, f]) => f === 'name')?.[0]
    if (!nameColumn) {
      setStatus('Map at least one column to "name" before importing.')
      return
    }
    const records = parsed.rows
      .map((row) => {
        const rec = {}
        for (const [header, field] of Object.entries(mapping)) {
          if (!field) continue
          const value = (row[header] || '').trim()
          if (!value) continue
          if (field === 'tags') {
            rec.tags = value
              .split(/[;,]/)
              .map((t) => t.trim())
              .filter(Boolean)
          } else if (field === 'additional_emails') {
            rec.emails = parseChannels(value, 'label', 'Other')
          } else if (field === 'additional_phones') {
            rec.phones = parseChannels(value, 'label', 'Other')
          } else if (field === 'socials') {
            rec.socials = parseChannels(value, 'platform', 'other')
          } else {
            rec[field] = value
          }
        }
        return rec
      })
      .filter((rec) => rec.name)
    if (!records.length) {
      setStatus('No rows with a name found.')
      return
    }

    await reviewAndImport(records)
  }

  // Shared by CSV and vCard import: flag rows that look like someone you already
  // have (default those to "skip"); if nothing's flagged, import straight away.
  const reviewAndImport = async (records) => {
    const reviewed = records.map((rec) => {
      const matches = findDuplicates(rec, active)
      return { rec, matches, action: matches.length ? 'skip' : 'import' }
    })
    if (reviewed.some((r) => r.matches.length)) {
      setReview({ records: reviewed })
      return
    }
    await doImport(records)
  }

  // ---- vCard import (.vcf from iPhone / Google Contacts) ----
  const onVcfFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setStatus(null)
    const reader = new FileReader()
    reader.onload = async () => {
      const records = parseVcf(String(reader.result))
      if (!records.length) {
        setStatus('No contacts found in that .vcf file.')
        return
      }
      await reviewAndImport(records)
    }
    reader.readAsText(file)
  }

  const doImport = async (records, skipped = 0) => {
    setBusy(true)
    try {
      await importPeople(records)
      const note = skipped ? ` ${skipped} duplicate${skipped === 1 ? '' : 's'} skipped.` : ''
      setStatus(`Imported ${records.length} ${records.length === 1 ? 'person' : 'people'}.${note}`)
      setParsed(null)
      setReview(null)
    } catch (err) {
      setStatus(`Import failed: ${err.message}`)
    }
    setBusy(false)
  }

  const confirmImport = async () => {
    const toImport = review.records.filter((r) => r.action === 'import')
    const skipped = review.records.length - toImport.length
    if (!toImport.length) {
      setStatus('Every row was skipped. Nothing imported.')
      setReview(null)
      setParsed(null)
      return
    }
    await doImport(
      toImport.map((r) => r.rec),
      skipped,
    )
  }

  const setRowAction = (index, action) =>
    setReview((prev) => ({
      records: prev.records.map((r, i) => (i === index ? { ...r, action } : r)),
    }))

  return (
    <div>
      <PageHeader title="Import / Export" subtitle="Your data, always portable. No lock-in." />

      {status && (
        <p className="demo-banner" style={{ color: 'var(--text)' }}>
          {status}
        </p>
      )}

      <SectionLabel>Full backup</SectionLabel>
      <div className="list">
        <button className="list-row" onClick={exportBackup}>
          <span className="activity-icon">
            <Database size={16} />
          </span>
          <div className="row-body">
            <div className="row-title">Download backup (JSON)</div>
            <div className="row-sub">
              Everything: people, orgs, network, activity, groups. Lossless & restorable.
            </div>
          </div>
          <Download size={18} className="row-chevron" />
        </button>
        <button className="list-row" onClick={() => jsonRef.current?.click()}>
          <span className="activity-icon">
            <RotateCcw size={16} />
          </span>
          <div className="row-body">
            <div className="row-title">Restore from backup</div>
            <div className="row-sub">Merge a backup file back in (overwrites matching ids).</div>
          </div>
          <Upload size={18} className="row-chevron" />
        </button>
      </div>
      <input
        ref={jsonRef}
        type="file"
        accept=".json,application/json"
        onChange={onBackupFile}
        style={{ display: 'none' }}
      />

      <SectionLabel>Phone contacts</SectionLabel>
      <div className="list">
        <button
          className="list-row"
          onClick={() => downloadVcf('doot-contacts', active, orgsById, affiliations)}
        >
          <span className="activity-icon">
            <Download size={16} />
          </span>
          <div className="row-body">
            <div className="row-title">Export vCard (.vcf)</div>
            <div className="row-sub">
              All {active.length} active {active.length === 1 ? 'person' : 'people'}. Imports
              straight into iPhone or Google contacts.
            </div>
          </div>
          <Download size={18} className="row-chevron" />
        </button>
        <button className="list-row" onClick={() => vcfRef.current?.click()}>
          <span className="activity-icon">
            <Upload size={16} />
          </span>
          <div className="row-body">
            <div className="row-title">Import vCard (.vcf)</div>
            <div className="row-sub">
              Upload contacts exported from iPhone or Google. Duplicates are flagged before
              importing.
            </div>
          </div>
          <Upload size={18} className="row-chevron" />
        </button>
      </div>
      <input
        ref={vcfRef}
        type="file"
        accept=".vcf,text/vcard"
        onChange={onVcfFile}
        style={{ display: 'none' }}
      />

      <SectionLabel>Spreadsheet (people)</SectionLabel>
      <div className="list">
        <button className="list-row" onClick={exportCsv}>
          <span className="activity-icon">
            <FileText size={16} />
          </span>
          <div className="row-body">
            <div className="row-title">Export people to CSV</div>
            <div className="row-sub">
              {active.length} active {active.length === 1 ? 'person' : 'people'}.
            </div>
          </div>
          <Download size={18} className="row-chevron" />
        </button>
        {/* Export only — there is deliberately no matching import. A touchpoint
            is a claim about something that happened on a date, and a CSV of them
            with no ids would have to guess which contact each row meant. Getting
            that wrong writes false history and moves cadence clocks, so the way
            back in is the JSON backup, which carries the ids. */}
        {interactions.length > 0 && (
          <button className="list-row" onClick={exportInteractionsCsv}>
            <span className="activity-icon">
              <FileText size={16} />
            </span>
            <div className="row-body">
              <div className="row-title">Export touchpoints to CSV</div>
              <div className="row-sub">{interactions.length} logged, with dates and notes.</div>
            </div>
            <Download size={18} className="row-chevron" />
          </button>
        )}
        <button className="list-row" onClick={() => csvRef.current?.click()}>
          <span className="activity-icon">
            <Upload size={16} />
          </span>
          <div className="row-body">
            <div className="row-title">Import people from CSV</div>
            <div className="row-sub">Upload, then map columns. Tags separated by ; or ,</div>
          </div>
          <Upload size={18} className="row-chevron" />
        </button>
      </div>
      <input
        ref={csvRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onCsvFile}
        style={{ display: 'none' }}
      />

      {parsed && !review && (
        <div className="section-gap">
          <SectionLabel>Column mapping · {parsed.rows.length} rows found</SectionLabel>
          <div className="list">
            {parsed.headers.map((header) => (
              <div className="map-row" key={header}>
                <span className="csv-col">{header}</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  →
                </span>
                <select
                  className="filter-select"
                  value={mapping[header] || ''}
                  onChange={(e) => setMapping({ ...mapping, [header]: e.target.value })}
                >
                  {SCHEMA_FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {FIELD_LABELS[f] || f || 'skip'}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <button className="btn-primary" onClick={runImport} disabled={busy}>
            {busy ? <span className="dots">Importing</span> : `Import ${parsed.rows.length} rows`}
          </button>
        </div>
      )}

      {review &&
        (() => {
          const flagged = review.records.filter((r) => r.matches.length)
          const importing = review.records.filter((r) => r.action === 'import').length
          return (
            <div className="section-gap">
              <SectionLabel>
                Possible duplicates · {flagged.length} of {review.records.length} rows match someone
                you already have
              </SectionLabel>
              <p className="row-sub" style={{ margin: '0 4px 12px' }}>
                These are skipped by default. Switch any row to “Import” to add it anyway.
              </p>
              <div className="list">
                {flagged.map((r) => {
                  const i = review.records.indexOf(r)
                  return (
                    <div className="dup-import-row" key={i}>
                      <div className="row-body">
                        <div className="row-title">{r.rec.name}</div>
                        <div className="row-sub">
                          matches {r.matches[0].person.name} ({r.matches[0].reasons.join(' · ')})
                        </div>
                      </div>
                      <Segmented
                        size="sm"
                        value={r.action}
                        onChange={(action) => setRowAction(i, action)}
                        options={[
                          { value: 'skip', label: 'Skip' },
                          { value: 'import', label: 'Import' },
                        ]}
                      />
                    </div>
                  )
                })}
              </div>
              <button className="btn-primary" onClick={confirmImport} disabled={busy}>
                {busy ? (
                  <span className="dots">Importing</span>
                ) : importing ? (
                  `Import ${importing} ${importing === 1 ? 'person' : 'people'}`
                ) : (
                  'Skip all & finish'
                )}
              </button>
            </div>
          )
        })()}
    </div>
  )
}
