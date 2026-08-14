// Notebook helpers. Notes store rich text as sanitized HTML in `body`; mentions
// of contacts / organizations / groups live inline as chip spans
// (<span class="mention" data-type data-id>@Name</span>) and are mirrored into
// the note's `mentions` array for in-memory backlinks on entity pages.
//
// The body HTML is rendered with dangerouslySetInnerHTML (snippets, backlinks,
// read-only views), so sanitizeNoteHtml is the security boundary: only an
// allowlist of formatting tags and the mention chip survive; scripts, event
// handlers, styles, and javascript: URLs are stripped.

// The entity kinds a mention can point at. Every one of them now has a backlink
// surface as well — person, org, group, list and project on their detail pages,
// habit on its own, and a plain task inside the sheet it's edited in — so a
// mention is never one-way.
export const MENTION_TYPES = ['person', 'organization', 'group', 'project', 'list', 'task', 'habit']

// Formatting tags kept as-is. Inline + block structure only — no media, no
// tables, nothing that can carry script or layout.
const ALLOWED_TAGS = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'strike',
  'br',
  'div',
  'p',
  'h1',
  'h2',
  'blockquote',
  'hr',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'span',
])

// Links: only web + mail schemes survive (no javascript:, data:, etc.).
function safeUrl(href) {
  const v = (href || '').trim()
  if (/^(https?:|mailto:)/i.test(v)) return v
  return null
}

// Inline images: web URLs or self-contained data:image payloads (how the app
// stores pasted/picked photos — see lib/image.js). Anything else is dropped.
function safeImgSrc(src) {
  const v = (src || '').trim()
  if (/^https?:\/\//i.test(v) || /^data:image\//i.test(v)) return v
  return null
}

// Strip a string down to text. Used for snippets, search, and the title
// fallback. Runs through the DOM so entities decode and tags vanish cleanly.
export function htmlToText(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(String(html), 'text/html')
  // Block elements should read as line breaks, not run together.
  doc.querySelectorAll('div, p, h1, h2, li, br').forEach((el) => {
    el.append('\n')
  })
  return (doc.body.textContent || '').replace(/\n{2,}/g, '\n').trim()
}

// Is this a mention chip? A <span> carrying a known data-type + data-id.
function mentionFields(el) {
  if (el.tagName?.toLowerCase() !== 'span') return null
  if (!el.classList.contains('mention')) return null
  const type = el.getAttribute('data-type')
  const id = el.getAttribute('data-id')
  if (!type || !id || !MENTION_TYPES.includes(type)) return null
  return { type, id }
}

// Allowlist sanitizer. Walks the parsed tree, rebuilding only permitted nodes.
// Mention chips are normalized (class, data-type, data-id, contenteditable=false
// — nothing else) so a hand-crafted span can't smuggle attributes through.
export function sanitizeNoteHtml(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(String(html), 'text/html')
  const out = doc.createElement('div')

  const clean = (node, into) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        // text node
        into.appendChild(doc.createTextNode(child.nodeValue))
        continue
      }
      if (child.nodeType !== 1) continue // skip comments, etc.
      const tag = child.tagName.toLowerCase()
      if (!ALLOWED_TAGS.has(tag)) {
        // Drop the tag but keep its (cleaned) contents — so unwrapping a
        // <font>/<a> doesn't delete the text inside it.
        clean(child, into)
        continue
      }
      const mention = mentionFields(child)
      if (tag === 'span' && !mention) {
        // A plain span carries no meaning here; unwrap it.
        clean(child, into)
        continue
      }
      const el = doc.createElement(tag)
      if (mention) {
        el.className = 'mention'
        el.setAttribute('data-type', mention.type)
        el.setAttribute('data-id', mention.id)
        el.setAttribute('contenteditable', 'false')
        el.textContent = child.textContent
        into.appendChild(el)
        continue // never recurse into a chip
      }
      // Links: keep only a safe href; drop the wrapper (keep text) if unsafe.
      if (tag === 'a') {
        const href = safeUrl(child.getAttribute('href'))
        if (!href) {
          clean(child, into)
          continue
        }
        el.setAttribute('href', href)
        el.setAttribute('target', '_blank')
        el.setAttribute('rel', 'noopener noreferrer')
      }
      // Images: keep a safe src (+ alt); drop entirely if the src isn't allowed.
      if (tag === 'img') {
        const src = safeImgSrc(child.getAttribute('src'))
        if (!src) continue
        el.setAttribute('src', src)
        const alt = child.getAttribute('alt')
        if (alt) el.setAttribute('alt', alt)
        into.appendChild(el)
        continue // void element — no children to recurse into
      }
      // Preserve the checklist markers so checkboxes survive a save round-trip:
      // the <ul class="checklist"> wrapper and each <li class="checklist-item"
      // data-checked>. No other class or attribute is carried over.
      if ((tag === 'ul' || tag === 'ol') && child.classList.contains('checklist')) {
        el.className = 'checklist'
      }
      if (tag === 'li' && child.classList.contains('checklist-item')) {
        el.className = 'checklist-item'
        if (child.getAttribute('data-checked') === 'true') el.setAttribute('data-checked', 'true')
      }
      clean(child, el)
      into.appendChild(el)
    }
  }

  clean(doc.body, out)
  return out.innerHTML
}

// Pull the deduped list of mentioned entities out of a note's body HTML, in
// document order. Shape matches the `mentions` column: [{type, id}].
export function extractMentions(html) {
  if (!html) return []
  const doc = new DOMParser().parseFromString(String(html), 'text/html')
  const seen = new Set()
  const out = []
  doc.querySelectorAll('span.mention').forEach((el) => {
    const m = mentionFields(el)
    if (!m) return
    const key = `${m.type}:${m.id}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(m)
  })
  return out
}

// The HTML for one inline mention chip — byte-for-byte what the editor inserts
// when you pick from the @-picker (RichTextEditor.choose), so a chip written by
// an entity page and one typed into the note are the same node. Escaped, because
// the label is a user-entered name.
const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  )

export function mentionChipHtml({ type, id, label }) {
  return `<span class="mention" data-type="${escapeHtml(type)}" data-id="${escapeHtml(id)}" contenteditable="false">@${escapeHtml(label)}</span>`
}

// Attach an entity to a note from the *entity's* side ("Attach existing" on a
// project page). The chip has to land in the body, not just in `mentions`: the
// editor recomputes mentions from the body on every save, so a link that isn't
// written down would be dropped the next time anyone typed in the note.
//
// It goes on its own line at the end — never mid-sentence — and a note that
// already mentions the entity comes back untouched.
export function withMention(body, { type, id, label }) {
  const html = body || ''
  if (extractMentions(html).some((m) => m.type === type && m.id === id)) return html
  return `${html}<div>${mentionChipHtml({ type, id, label })}</div>`
}

// The reverse: pull every chip pointing at one entity out of a note's body. A
// wrapper left holding nothing (the line `withMention` added) goes too, so
// detaching doesn't leave a blank line behind.
export function withoutMention(body, { type, id }) {
  if (!body) return ''
  const doc = new DOMParser().parseFromString(String(body), 'text/html')
  doc.querySelectorAll('span.mention').forEach((el) => {
    if (el.getAttribute('data-type') !== type || el.getAttribute('data-id') !== id) return
    const parent = el.parentElement
    el.remove()
    if (parent && parent !== doc.body && !parent.textContent.trim() && !parent.children.length) {
      parent.remove()
    }
  })
  return doc.body.innerHTML
}

// An invisible separator, wrapped around each mention chip's text so a line
// that is *only* chips can be told from one that merely contains them. It has
// to be a real character rather than a marker element: line breaks come from
// htmlToText, which flattens the tree.
const CHIP_MARK = '⁣'
const CHIP_RUN = /⁣[^⁣]*⁣/g

function markedLines(html) {
  if (!html) return []
  const doc = new DOMParser().parseFromString(String(html), 'text/html')
  doc.querySelectorAll('span.mention').forEach((el) => {
    el.textContent = `${CHIP_MARK}${el.textContent}${CHIP_MARK}`
  })
  return htmlToText(doc.body.innerHTML)
    .split('\n')
    .filter((l) => l.trim())
}

// The body's lines as they read, minus the ones holding nothing but @-mention
// chips. Those are filing markers — a note started from a project page opens
// with one — and naming a note after the project it's filed under tells you
// nothing you didn't already know. Unless the chips are the whole note, in
// which case they're still all there is to show.
function displayLines(html) {
  const lines = markedLines(html)
  const prose = lines.filter((l) => l.replace(CHIP_RUN, '').trim())
  return (prose.length ? prose : lines).map((l) => l.split(CHIP_MARK).join('').trim())
}

// Display title: the explicit title, else the first line the body actually
// says, else a gentle placeholder. Never returns raw HTML.
export function noteTitle(note) {
  const t = (note?.title || '').trim()
  if (t) return t
  return displayLines(note?.body)[0] || 'New note'
}

// One-line preview: the body text with the title's line removed (so the snippet
// doesn't just echo the title).
export function noteSnippet(note, max = 100) {
  const lines = displayLines(note?.body)
  const explicitTitle = (note?.title || '').trim()
  // If the title is implicit, it came from the first of these lines — drop it.
  const snippet = (explicitTitle ? lines : lines.slice(1)).join(' ').trim()
  return snippet.length > max ? snippet.slice(0, max).trimEnd() + '…' : snippet
}

// Notes that @-mention a given entity — drives the "Mentioned in notes" backlink
// section on entity pages. Pass the already privacy-filtered `data.notes`.
// `type` takes an array when one page answers to several mention types: a
// project page matches both 'project' and 'task', because a task mentioned
// before it was promoted still carries the type it had when it was chosen.
export function notesMentioning(notes, type, id) {
  if (!Array.isArray(notes) || !id) return []
  const types = Array.isArray(type) ? type : [type]
  return notes.filter((n) =>
    (n.mentions || []).some((m) => m && types.includes(m.type) && m.id === id),
  )
}

// Is this note effectively empty? Drives auto-discard when a freshly created
// note is left untouched. A title, any text, an image, a divider, or a mention
// chip all count as content. Regex-based so it needs no DOM (callable anywhere).
export function isNoteEmpty(note) {
  if (!note) return true
  if ((note.title || '').trim()) return false
  const body = note.body || ''
  if (/<(img|hr)\b/i.test(body)) return false
  if (/class="mention"/.test(body)) return false
  const text = body
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim()
  return !text
}

// Bare URLs → clickable links. Runs on a finished HTML string (e.g. on blur):
// walks text nodes that aren't already inside a link or a mention chip and wraps
// any http(s)/www URL. Returns the input unchanged where there's no DOM.
const URL_RE = /\b(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi
const trimUrlTail = (u) => {
  // Don't swallow trailing sentence punctuation into the link.
  const m = /[.,;:!?)]+$/.exec(u)
  return m ? u.slice(0, u.length - m[0].length) : u
}
export function linkifyHtml(html) {
  if (!html || typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(String(html), 'text/html')
  const walk = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1) {
        const tag = child.tagName.toLowerCase()
        if (tag === 'a' || (tag === 'span' && child.classList.contains('mention'))) continue
        walk(child)
      } else if (child.nodeType === 3 && URL_RE.test(child.nodeValue)) {
        URL_RE.lastIndex = 0
        const text = child.nodeValue
        const frag = doc.createDocumentFragment()
        let last = 0
        let m
        while ((m = URL_RE.exec(text))) {
          const url = trimUrlTail(m[0])
          frag.appendChild(doc.createTextNode(text.slice(last, m.index)))
          const a = doc.createElement('a')
          a.setAttribute('href', url.startsWith('www.') ? `https://${url}` : url)
          a.setAttribute('target', '_blank')
          a.setAttribute('rel', 'noopener noreferrer')
          a.textContent = url
          frag.appendChild(a)
          last = m.index + url.length
        }
        frag.appendChild(doc.createTextNode(text.slice(last)))
        child.replaceWith(frag)
      }
    }
  }
  walk(doc.body)
  return doc.body.innerHTML
}

// The @-mention candidate list, built from the loaded data — every entity a
// note can reference, and every one of them links back (see MENTION_TYPES).
// Returns [{type,id,label,sub}].
export function mentionCandidates(data) {
  const out = []
  for (const p of data.people || [])
    if (p.name) out.push({ type: 'person', id: p.id, label: p.name, sub: 'Contact' })
  for (const o of data.orgs || [])
    if (o.name) out.push({ type: 'organization', id: o.id, label: o.name, sub: 'Org' })
  for (const g of data.groups || [])
    if (g.name) out.push({ type: 'group', id: g.id, label: g.name, sub: 'Group' })
  for (const t of data.tasks || []) {
    if (t.is_heading || !t.title) continue
    out.push(
      t.is_project
        ? { type: 'project', id: t.id, label: t.title, sub: 'Project' }
        : { type: 'task', id: t.id, label: t.title, sub: 'Task' },
    )
  }
  for (const l of data.lists || [])
    if (l.name) out.push({ type: 'list', id: l.id, label: l.name, sub: 'List' })
  // Own habits only: a housemate's shared habit is read-only and naming it in
  // your notebook would file backlinks on a page you can't act on.
  for (const h of data.habits || [])
    if (h.name && !h.archived_at) out.push({ type: 'habit', id: h.id, label: h.name, sub: 'Habit' })
  return out
}

// Sort for the index: pinned always first, then by the chosen mode
// ('edited' = most-recently-updated, 'created' = newest, 'title' = A→Z).
export function sortNotes(notes, mode = 'edited') {
  const byDate = (key) => (a, b) => ((b[key] || '') < (a[key] || '') ? -1 : 1)
  const cmp =
    mode === 'created'
      ? byDate('created_at')
      : mode === 'title'
        ? (a, b) => noteTitle(a).localeCompare(noteTitle(b))
        : byDate('updated_at')
  return [...(notes || [])].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    return cmp(a, b)
  })
}
