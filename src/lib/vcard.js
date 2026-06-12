// vCard 3.0 export — the contact bridge (Phase 8a). 3.0 because it's what
// iOS and Google Contacts import most reliably. Opening a .vcf on iPhone
// offers "Create New Contact" straight from Files/Mail/AirDrop.

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

export function personToVcard(person) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0']

  lines.push(`FN:${esc(person.name)}`)
  // Naive split for N: last word = family name. Good enough for sorting in
  // the phone's address book; FN is what's displayed anyway.
  const parts = (person.name || '').trim().split(/\s+/)
  const family = parts.length > 1 ? parts.pop() : ''
  lines.push(`N:${esc(family)};${esc(parts.join(' '))};;;`)

  if (person.organization) lines.push(`ORG:${esc(person.organization)}`)
  if (person.role) lines.push(`TITLE:${esc(person.role)}`)
  if (person.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(person.email)}`)
  if (person.phone) lines.push(`TEL;TYPE=CELL:${esc(person.phone)}`)
  if (person.birthday) lines.push(`BDAY:${person.birthday}`)
  if (person.address) lines.push(`ADR;TYPE=HOME:;;${esc(person.address)};;;;`)
  if ((person.tags || []).length) lines.push(`CATEGORIES:${person.tags.map(esc).join(',')}`)
  if (person.notes) lines.push(`NOTE:${esc(person.notes)}`)
  // Stable UID so re-importing updates instead of duplicating (CardDAV-ready).
  lines.push(`UID:salernidex-${person.id}`)
  lines.push('END:VCARD')

  return lines.map(fold).join('\r\n')
}

export function peopleToVcf(people) {
  return people.map(personToVcard).join('\r\n') + '\r\n'
}

export function downloadVcf(filename, people) {
  const blob = new Blob([peopleToVcf(people)], { type: 'text/vcard;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.replace(/[\\/:*?"<>|]/g, '').trim() + '.vcf'
  a.click()
  URL.revokeObjectURL(url)
}
