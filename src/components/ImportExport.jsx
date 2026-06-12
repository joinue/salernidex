import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { Download, Upload, Database, FileText, RotateCcw } from 'react-feather'
import PageHeader from './PageHeader'
import Segmented from './Segmented'
import { memberNames, setMemberNames } from '../lib/household'
import { getAllPrefs, setAllPrefs } from '../lib/notifyPrefs'
import { downloadVcf } from '../lib/vcard'
import { findDuplicates } from '../lib/duplicates'

// Bump when the backup shape changes so future imports can migrate if needed.
// v3: adds families, key_dates, and people.tier/family_id (Phase 7).
// v4: adds reminder_snoozes + settings.notifications (Phase 6a).
const BACKUP_VERSION = 4

const SCHEMA_FIELDS = ['', 'name', 'organization', 'role', 'email', 'phone', 'birthday', 'address', 'tier', 'tags', 'notes']

// Auto-map CSV headers to schema fields by loose name match
function guessField(header) {
  const h = header.toLowerCase().replace(/[^a-z]/g, '')
  if (h.includes('name')) return 'name'
  if (h.includes('org') || h.includes('company')) return 'organization'
  if (h.includes('role') || h.includes('title') || h.includes('position')) return 'role'
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
  URL.revokeObjectURL(url)
}

export default function ImportExport({ data }) {
  const { people, orgs, relationships, interactions, groups, tasks, completions, taskLinks, lists, listItems, families, keyDates, reminderSnoozes, importPeople, restoreBackup } = data
  const csvRef = useRef(null)
  const jsonRef = useRef(null)
  const [parsed, setParsed] = useState(null) // { headers, rows }
  const [mapping, setMapping] = useState({})
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState(null) // { records: [{rec, matches, action}] }

  const active = people.filter((p) => !p.deleted_at)

  // ---- Full backup (everything, round-trippable) ----
  const exportBackup = () => {
    const backup = {
      app: 'salernidex',
      backup_version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      people, // includes soft-deleted, so restore is lossless
      organizations: orgs,
      relationships,
      interactions,
      families,
      key_dates: keyDates,
      groups,
      tasks,
      task_completions: completions,
      task_links: taskLinks,
      lists,
      list_items: listItems,
      reminder_snoozes: reminderSnoozes,
      settings: { members: memberNames(), notifications: getAllPrefs() },
    }
    const stamp = new Date().toISOString().slice(0, 10)
    download(`salernidex-backup-${stamp}.json`, JSON.stringify(backup, null, 2), 'application/json')
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
      if (backup.app !== 'salernidex' || !Array.isArray(backup.people)) {
        setStatus('This does not look like a Salernidex backup.')
        return
      }
      const counts = ['people', 'organizations', 'relationships', 'interactions', 'families', 'key_dates', 'groups', 'tasks', 'task_completions', 'task_links', 'lists', 'list_items', 'reminder_snoozes']
        .map((k) => (backup[k] || []).length)
        .reduce((a, b) => a + b, 0)
      if (!window.confirm(`Restore ${counts} records from this backup? Existing records with the same id are overwritten; the rest are kept.`)) return
      setBusy(true)
      try {
        await restoreBackup(backup)
        if (backup.settings?.members) setMemberNames(backup.settings.members)
        if (backup.settings?.notifications) setAllPrefs(backup.settings.notifications)
        setStatus(`Restored backup from ${backup.exported_at?.slice(0, 10) || 'file'}.`)
      } catch (err) {
        setStatus(`Restore failed: ${err.message}`)
      }
      setBusy(false)
    }
    reader.readAsText(file)
  }

  // ---- CSV (people only, for moving between tools) ----
  const exportCsv = () => {
    const csv = Papa.unparse(
      active.map((p) => ({
        name: p.name,
        organization: p.organization || '',
        role: p.role || '',
        email: p.email || '',
        phone: p.phone || '',
        birthday: p.birthday || '',
        address: p.address || '',
        tier: p.tier || '',
        tags: (p.tags || []).join('; '),
        keep_in_touch_days: p.keep_in_touch_days || '',
        privacy_level: p.privacy_level,
        notes: p.notes || '',
      }))
    )
    download('salernidex-people.csv', csv, 'text/csv')
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
          rec[field] = field === 'tags' ? value.split(/[;,]/).map((t) => t.trim()).filter(Boolean) : value
        }
        return rec
      })
      .filter((rec) => rec.name)
    if (!records.length) {
      setStatus('No rows with a name found.')
      return
    }

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
      setStatus('Every row was skipped — nothing imported.')
      setReview(null)
      setParsed(null)
      return
    }
    await doImport(toImport.map((r) => r.rec), skipped)
  }

  const setRowAction = (index, action) =>
    setReview((prev) => ({
      records: prev.records.map((r, i) => (i === index ? { ...r, action } : r)),
    }))

  return (
    <div>
      <PageHeader title="Import / Export" subtitle="Your data, always portable — no lock-in." />

      {status && (
        <p className="demo-banner" style={{ color: 'var(--text)' }}>{status}</p>
      )}

      <div className="section-label">Full backup</div>
      <div className="list">
        <button className="list-row" onClick={exportBackup}>
          <span className="activity-icon"><Database size={16} /></span>
          <div className="row-body">
            <div className="row-title">Download backup (JSON)</div>
            <div className="row-sub">Everything — people, orgs, network, activity, groups. Lossless & restorable.</div>
          </div>
          <Download size={18} className="row-chevron" />
        </button>
        <button className="list-row" onClick={() => jsonRef.current?.click()}>
          <span className="activity-icon"><RotateCcw size={16} /></span>
          <div className="row-body">
            <div className="row-title">Restore from backup</div>
            <div className="row-sub">Merge a backup file back in (overwrites matching ids).</div>
          </div>
          <Upload size={18} className="row-chevron" />
        </button>
      </div>
      <input ref={jsonRef} type="file" accept=".json,application/json" onChange={onBackupFile} style={{ display: 'none' }} />

      <div className="section-label">Phone contacts</div>
      <div className="list">
        <button className="list-row" onClick={() => downloadVcf('salernidex-contacts', active)}>
          <span className="activity-icon"><Download size={16} /></span>
          <div className="row-body">
            <div className="row-title">Export vCard (.vcf)</div>
            <div className="row-sub">
              All {active.length} active {active.length === 1 ? 'person' : 'people'} — imports straight into iPhone or Google contacts.
            </div>
          </div>
          <Download size={18} className="row-chevron" />
        </button>
      </div>

      <div className="section-label">Spreadsheet (people)</div>
      <div className="list">
        <button className="list-row" onClick={exportCsv}>
          <span className="activity-icon"><FileText size={16} /></span>
          <div className="row-body">
            <div className="row-title">Export people to CSV</div>
            <div className="row-sub">{active.length} active {active.length === 1 ? 'person' : 'people'}.</div>
          </div>
          <Download size={18} className="row-chevron" />
        </button>
        <button className="list-row" onClick={() => csvRef.current?.click()}>
          <span className="activity-icon"><Upload size={16} /></span>
          <div className="row-body">
            <div className="row-title">Import people from CSV</div>
            <div className="row-sub">Upload, then map columns. Tags separated by ; or ,</div>
          </div>
          <Upload size={18} className="row-chevron" />
        </button>
      </div>
      <input ref={csvRef} type="file" accept=".csv,text/csv" onChange={onCsvFile} style={{ display: 'none' }} />

      {parsed && !review && (
        <div className="section-gap">
          <div className="section-label">Column mapping — {parsed.rows.length} rows found</div>
          <div className="list">
            {parsed.headers.map((header) => (
              <div className="map-row" key={header}>
                <span className="csv-col">{header}</span>
                <span className="muted" style={{ fontSize: 13 }}>→</span>
                <select
                  className="filter-select"
                  value={mapping[header] || ''}
                  onChange={(e) => setMapping({ ...mapping, [header]: e.target.value })}
                >
                  {SCHEMA_FIELDS.map((f) => (
                    <option key={f} value={f}>{f || 'skip'}</option>
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

      {review && (() => {
        const flagged = review.records.filter((r) => r.matches.length)
        const importing = review.records.filter((r) => r.action === 'import').length
        return (
          <div className="section-gap">
            <div className="section-label">
              Possible duplicates — {flagged.length} of {review.records.length} rows match someone you already have
            </div>
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
                        matches {r.matches[0].person.name} — {r.matches[0].reasons.join(' · ')}
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
