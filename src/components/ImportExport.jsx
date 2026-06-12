import { useRef, useState } from 'react'
import Papa from 'papaparse'

const SCHEMA_FIELDS = ['', 'name', 'organization', 'role', 'email', 'phone', 'birthday', 'address', 'tags', 'notes']

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
  const { people, importPeople } = data
  const fileRef = useRef(null)
  const [parsed, setParsed] = useState(null) // { headers, rows }
  const [mapping, setMapping] = useState({})
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  const active = people.filter((p) => !p.deleted_at)

  const onFile = (e) => {
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
    setBusy(true)
    try {
      await importPeople(records)
      setStatus(`Imported ${records.length} ${records.length === 1 ? 'person' : 'people'}.`)
      setParsed(null)
    } catch (err) {
      setStatus(`Import failed: ${err.message}`)
    }
    setBusy(false)
  }

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
        tags: (p.tags || []).join('; '),
        privacy_level: p.privacy_level,
        notes: p.notes || '',
      }))
    )
    download('salernidex-people.csv', csv, 'text/csv')
  }

  const exportJson = () => {
    download('salernidex-export.json', JSON.stringify({
      exported_at: new Date().toISOString(),
      people: active,
      organizations: data.orgs,
      relationships: data.relationships,
    }, null, 2), 'application/json')
  }

  return (
    <div>
      <h1 className="page-title">Import / Export</h1>

      <span className="label">Export</span>
      <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>
        {active.length} active {active.length === 1 ? 'person' : 'people'} in the database. Your data, always portable.
      </p>
      <div style={{ display: 'flex', gap: 16 }}>
        <button className="text-btn" onClick={exportCsv}>Download CSV</button>
        <button className="text-btn" onClick={exportJson}>Download JSON (full)</button>
      </div>

      <div className="section-gap">
        <span className="label">Import people from CSV</span>
        <p className="muted" style={{ fontSize: 14, margin: '4px 0 12px' }}>
          Upload a CSV, then match its columns to Salernidex fields. Tags can be separated with ; or ,
        </p>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
        <button className="text-btn" onClick={() => fileRef.current?.click()}>Choose CSV file…</button>
      </div>

      {status && <p style={{ marginTop: 16, fontSize: 14 }}>{status}</p>}

      {parsed && (
        <div className="section-gap">
          <span className="label">Column mapping — {parsed.rows.length} rows found</span>
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
          <div style={{ marginTop: 24 }}>
            <button className="btn-primary" onClick={runImport} disabled={busy}>
              {busy ? <span className="dots">Importing</span> : `Import ${parsed.rows.length} rows`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
