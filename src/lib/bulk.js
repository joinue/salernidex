// What a selection turns into when you copy it.
//
// Markdown because it is the format that survives being pasted anywhere — a
// text message keeps the lines, Notes keeps the checkboxes, a doc keeps both.
// Falls out of multi-select for free (docs/scopes/competitive-superlist.md
// item 15), which is why it lives here rather than growing its own feature.

// A checkable row — a task, a list item — renders as a task-list item so the
// check state survives the paste. Anything else is a plain bullet: a note has
// no state to carry, and `- [ ]` on one would invent a to-do the user never
// made.
function line(row, { checkable }) {
  const text = String(row.title || row.name || row.text || '').trim()
  if (!text) return null
  if (!checkable) return `- ${text}`
  const done = !!(row.completed_at || row.checked_at)
  return `- [${done ? 'x' : ' '}] ${text}`
}

// Quantity and note are what make a copied grocery list usable at the shop —
// "milk" alone loses the "2 gal" and the "the oat one" that were the reason
// somebody wrote the row.
function detail(row) {
  const bits = []
  if (row.qty) bits.push(String(row.qty).trim())
  if (row.note) bits.push(String(row.note).trim())
  return bits.filter(Boolean).join(' · ')
}

export function toMarkdown(rows, { checkable = true, heading = null } = {}) {
  const body = (rows || [])
    .filter((r) => r && !r.is_heading)
    .map((r) => {
      const base = line(r, { checkable })
      if (!base) return null
      const extra = detail(r)
      return extra ? `${base} (${extra})` : base
    })
    .filter(Boolean)
  if (!body.length) return ''
  // The list's own name, so a pasted block says what it is. Markdown heading
  // rather than bold: it degrades to a readable line in plain text either way.
  return heading ? `## ${heading}\n${body.join('\n')}` : body.join('\n')
}

// Put it on the clipboard. Same shape as lib/share's fallback and for the same
// reason: `await undefined` resolves, so a missing clipboard API would
// otherwise be reported as a successful copy.
export async function copyText(text, { nav = navigator } = {}) {
  if (!text) return false
  if (typeof nav?.clipboard?.writeText !== 'function') return false
  try {
    await nav.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// "3 tasks" — the phrase every bulk confirmation and toast needs, in one place
// so they can't disagree about pluralisation.
export function countLabel(n, noun) {
  return `${n} ${n === 1 ? noun : `${noun}s`}`
}
