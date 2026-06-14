// vCard 3.0 export + import — the contact bridge (Phase 8a). 3.0 because it's
// what iOS and Google Contacts import most reliably. Opening a .vcf on iPhone
// offers "Create New Contact" straight from Files/Mail/AirDrop; the import side
// reads a .vcf the user exports from their phone to seed the rolodex.
import { formatAddress } from './address'
import { socialUrl, labelToVcardType } from './contactChannels'
import { SOCIAL_BY_ID } from './constants'

// Escape per RFC 2426: backslash, newlines, commas, semicolons.
function esc(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

// Content lines fold at 75 chars; continuations start with a space.
function fold(line) {
  const out = []
  let rest = line
  while (rest.length > 75) {
    out.push(rest.slice(0, 75))
    rest = ' ' + rest.slice(75)
  }
  out.push(rest)
  return out.join('\r\n')
}

// `orgsById` (Map id → org row) resolves the person's organization name, since
// people reference orgs by id now. vCard ORG is a string by spec, so we write
// the resolved name; omitted when there's no org or no map.
export function personToVcard(person, orgsById) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0']

  lines.push(`FN:${esc(person.name)}`)
  // Naive split for N: last word = family name. Good enough for sorting in
  // the phone's address book; FN is what's displayed anyway.
  const parts = (person.name || '').trim().split(/\s+/)
  const family = parts.length > 1 ? parts.pop() : ''
  lines.push(`N:${esc(family)};${esc(parts.join(' '))};;;`)

  const orgName = orgsById?.get(person.organization_id)?.name
  if (orgName) lines.push(`ORG:${esc(orgName)}`)
  if (person.role) lines.push(`TITLE:${esc(person.role)}`)
  if (person.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(person.email)}`)
  for (const em of person.emails || []) {
    if (em?.value) lines.push(`EMAIL;TYPE=${labelToVcardType(em.label)}:${esc(em.value)}`)
  }
  if (person.phone) lines.push(`TEL;TYPE=CELL:${esc(person.phone)}`)
  for (const tel of person.phones || []) {
    if (tel?.value) lines.push(`TEL;TYPE=${labelToVcardType(tel.label)}:${esc(tel.value)}`)
  }
  for (const s of person.socials || []) {
    const url = socialUrl(s)
    if (url) lines.push(`URL;TYPE=${(s.platform || 'other').toUpperCase()}:${esc(url)}`)
  }
  if (person.birthday) lines.push(`BDAY:${person.birthday}`)
  if (person.address) lines.push(`ADR;TYPE=HOME:;;${esc(person.address)};;;;`)
  if ((person.tags || []).length) lines.push(`CATEGORIES:${person.tags.map(esc).join(',')}`)
  if (person.notes) lines.push(`NOTE:${esc(person.notes)}`)
  // Stable UID so re-importing updates instead of duplicating (CardDAV-ready).
  lines.push(`UID:salernidex-${person.id}`)
  lines.push('END:VCARD')

  return lines.map(fold).join('\r\n')
}

export function peopleToVcf(people, orgsById) {
  return people.map((p) => personToVcard(p, orgsById)).join('\r\n') + '\r\n'
}

export function downloadVcf(filename, people, orgsById) {
  const blob = new Blob([peopleToVcf(people, orgsById)], { type: 'text/vcard;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.replace(/[\\/:*?"<>|]/g, '').trim() + '.vcf'
  a.click()
  // Defer the revoke: revoking synchronously can cancel the download before the
  // browser has read the blob (more likely the larger the file).
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// ---- Import (parse a .vcf back into person records) --------------------

// Reverse of esc(): one pass, left to right, so "\\," (escaped backslash then
// separator) and "\," (escaped comma) never get confused.
function unescapeVcf(value) {
  return String(value).replace(/\\([\\,;nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c))
}

// Split a structured value on its separator, honoring backslash-escapes (so an
// escaped "\;" inside a component isn't treated as a boundary).
function splitOn(value, sep) {
  const out = []
  let buf = ''
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '\\' && i + 1 < value.length) {
      buf += ch + value[i + 1]
      i++
    } else if (ch === sep) {
      out.push(buf)
      buf = ''
    } else {
      buf += ch
    }
  }
  out.push(buf)
  return out
}

// Unfold continuation lines (RFC: a CRLF followed by a space/tab is a fold),
// normalizing line endings first.
function unfold(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
}

// "GROUP.NAME;PARAM=x:value" → { name: 'NAME', params: {PARAM:'x'}, value }.
// Value is split on the first colon only (URLs etc. may contain more).
function parseLine(line) {
  const idx = line.indexOf(':')
  if (idx === -1) return null
  const segs = line.slice(0, idx).split(';')
  let name = segs[0]
  if (name.includes('.')) name = name.split('.').pop() // drop the optional group prefix
  const params = {}
  for (const seg of segs.slice(1)) {
    const eq = seg.indexOf('=')
    if (eq === -1) params[seg.toUpperCase()] = true
    else params[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1)
  }
  return { name: name.toUpperCase(), params, value: line.slice(idx + 1) }
}

// BDAY → YYYY-MM-DD, or null. A no-year birthday (--MM-DD) can't be stored in
// the `date` column, so it's dropped rather than guessed.
function normalizeBday(value) {
  const s = String(value).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) // 1990-05-20 (optionally with time)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/) // 19900520 (basic format)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

// Collect a property's TYPE tokens, whether written as `TYPE=WORK` (one param)
// or bare `WORK` (a valueless param), upper-cased and split on commas.
function typeTokens(params) {
  const toks = []
  for (const [k, v] of Object.entries(params)) {
    if (k === 'TYPE') toks.push(...String(v).toUpperCase().split(','))
    else if (v === true) toks.push(k.toUpperCase())
  }
  return toks
}

// TYPE tokens → an email/phone label we offer in the editor.
function typeToLabel(params) {
  const toks = typeTokens(params)
  if (toks.includes('CELL') || toks.includes('MOBILE')) return 'Mobile'
  if (toks.includes('WORK')) return 'Work'
  if (toks.includes('HOME')) return 'Home'
  return 'Other'
}

// TYPE tokens (or the URL host) → a known social platform id, else 'website'.
function typeToPlatform(params, value) {
  const toks = typeTokens(params).map((t) => t.toLowerCase())
  const known = toks.find((t) => SOCIAL_BY_ID[t])
  if (known) return known
  const v = (value || '').toLowerCase()
  for (const id of Object.keys(SOCIAL_BY_ID)) {
    if (id !== 'website' && id !== 'other' && v.includes(`${id}.com`)) return id
  }
  if (v.includes('twitter.com')) return 'x'
  return 'website'
}

function cardToRecord(propLines) {
  const props = propLines.map(parseLine).filter(Boolean)
  const first = (n) => props.find((p) => p.name === n)
  const all = (n) => props.filter((p) => p.name === n)
  const rec = {}

  const fn = first('FN')
  if (fn) rec.name = unescapeVcf(fn.value).trim()
  if (!rec.name) {
    // Fall back to the structured name: N = Family;Given;Additional;Prefix;Suffix
    const n = first('N')
    if (n) {
      const c = splitOn(n.value, ';').map(unescapeVcf)
      rec.name = [c[1], c[0]]
        .map((s) => (s || '').trim())
        .filter(Boolean)
        .join(' ')
    }
  }

  const org = first('ORG') // "Company;Department" — keep the company
  if (org) rec.organization = (splitOn(org.value, ';').map(unescapeVcf)[0] || '').trim()
  const title = first('TITLE')
  if (title) rec.role = unescapeVcf(title.value).trim()
  // First email/phone become the primary scalar (where search + dedupe live);
  // the rest land in the labeled arrays.
  const emails = all('EMAIL')
    .map((e) => ({ label: typeToLabel(e.params), value: unescapeVcf(e.value).trim() }))
    .filter((e) => e.value)
  if (emails.length) {
    rec.email = emails[0].value
    if (emails.length > 1) rec.emails = emails.slice(1)
  }
  const tels = all('TEL')
    .map((t) => ({ label: typeToLabel(t.params), value: unescapeVcf(t.value).trim() }))
    .filter((t) => t.value)
  if (tels.length) {
    rec.phone = tels[0].value
    if (tels.length > 1) rec.phones = tels.slice(1)
  }
  const socials = [...all('URL'), ...all('X-SOCIALPROFILE')]
    .map((u) => {
      const value = unescapeVcf(u.value).trim()
      return { platform: typeToPlatform(u.params, value), value }
    })
    .filter((s) => s.value)
  if (socials.length) rec.socials = socials

  const bday = first('BDAY')
  if (bday) {
    const d = normalizeBday(bday.value)
    if (d) rec.birthday = d
  }

  const adr = first('ADR') // PObox;ext;street;city;region;postal;country
  if (adr) {
    const c = splitOn(adr.value, ';').map(unescapeVcf)
    const address = formatAddress({
      street: c[2],
      city: c[3],
      state: c[4],
      zip: c[5],
      country: c[6],
    })
    if (address) rec.address = address
  }

  const cats = first('CATEGORIES') // comma-separated list
  if (cats) {
    const tags = splitOn(cats.value, ',')
      .map((t) => unescapeVcf(t).trim())
      .filter(Boolean)
    if (tags.length) rec.tags = tags
  }

  const note = first('NOTE')
  if (note) rec.notes = unescapeVcf(note.value).trim()

  return rec
}

// Parse a .vcf file (one or many cards) into person records shaped like the
// CSV importer's, so both feed the same dedupe/review pipeline. Cards without a
// usable name are dropped.
export function parseVcf(text) {
  const cards = []
  let cur = null
  for (const raw of unfold(text).split('\n')) {
    const line = raw.trim()
    if (/^BEGIN:VCARD$/i.test(line)) cur = []
    else if (/^END:VCARD$/i.test(line)) {
      if (cur) cards.push(cur)
      cur = null
    } else if (cur && line) cur.push(line)
  }
  return cards.map(cardToRecord).filter((r) => r.name)
}
