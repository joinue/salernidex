import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bold,
  Italic,
  Underline,
  Type,
  List,
  CheckSquare,
  Image as ImageIcon,
  Minus,
} from 'react-feather'
import { sanitizeNoteHtml, linkifyHtml } from '../../lib/notes'
import { fileToImageDataUrl } from '../../lib/image'
import { showToast } from '../../lib/toast'
import { useVisualBandBottom } from '../../hooks/useKeyboardOpen'
import { useMediaQuery } from '../../hooks/useMediaQuery'

// Hand-rolled rich-text editor — a contentEditable surface with a formatting
// toolbar, @-mention picker, inline images, auto-linked URLs, and Markdown-style
// shortcuts. No editor dependency: standard formatting rides document.execCommand
// (styleWithCSS off so it emits tags, matching the sanitizer's allowlist),
// mentions/images insert as atomic nodes, and bare URLs linkify on blur.
//
// The DOM is the source of truth while editing (writing `value` back on every
// keystroke would fight the caret). We seed innerHTML once, then push sanitized
// HTML up via onChange. Remount (key by note id) to load a different note.

let styleInit = false
function ensureStyleWithTags() {
  if (styleInit) return
  try {
    document.execCommand('styleWithCSS', false, false)
  } catch {
    /* not all engines support the query; the default is already tag-based */
  }
  styleInit = true
}

// The token being typed for a mention: an "@" preceded by start-or-space, then
// word-ish chars, sitting right at the caret. Returns {query, range} or null.
function mentionToken() {
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return null
  const node = sel.anchorNode
  if (!node || node.nodeType !== 3) return null // must be inside a text node
  const text = node.nodeValue.slice(0, sel.anchorOffset)
  const m = /(^|\s)@([\p{L}\p{N}_'’.\- ]{0,40})$/u.exec(text)
  if (!m) return null
  const at = sel.anchorOffset - (m[2].length + 1)
  const range = document.createRange()
  range.setStart(node, at)
  range.setEnd(node, sel.anchorOffset)
  return { query: m[2].trim(), range }
}

// Markdown line-start shortcuts: the prefix typed before the triggering space.
const MARKDOWN = {
  '#': 'heading',
  '-': 'bullet',
  '*': 'bullet',
  '>': 'quote',
  '1.': 'numbered',
  '[]': 'checklist',
  '[ ]': 'checklist',
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Where to put the @-mention picker. Both `getBoundingClientRect` and
// `position: fixed` resolve against the layout viewport, so caret rect and
// picker offsets are directly comparable — but on a phone the layout viewport
// is not what you can see. The keyboard covers its bottom and Safari pans it,
// so the picker used to open behind the keyboard (and, near the right edge,
// half off-screen) whenever you typed "@" low in a note. visualViewport is the
// visible band inside it; keep the picker in there.
const PICKER_W = 240
const PICKER_MAX_H = 260
const PICKER_ROW_H = 37 // one .mention-option, incl. its padding
const CARET_GAP = 4
const EDGE_GAP = 8

function placePicker(rect, count) {
  const vv = window.visualViewport
  const vTop = vv ? vv.offsetTop : 0
  const vLeft = vv ? vv.offsetLeft : 0
  const vh = vv ? vv.height : window.innerHeight
  const vw = vv ? vv.width : window.innerWidth
  const h = Math.min(PICKER_MAX_H, count * PICKER_ROW_H + 12)

  // Below the caret by default, flipped above it when that would run past the
  // bottom of the visible band — which, with a keyboard up, is its top edge.
  const below = rect.bottom + CARET_GAP
  const top =
    below + h > vTop + vh - EDGE_GAP ? Math.max(vTop + EDGE_GAP, rect.top - CARET_GAP - h) : below
  // Clamp horizontally too; `.mention-picker` caps its own width for the case
  // where the band is narrower than the picker and this can't help.
  const left = Math.max(vLeft + EDGE_GAP, Math.min(rect.left, vLeft + vw - PICKER_W - EDGE_GAP))
  return { top, left }
}

export default function RichTextEditor({
  initialHtml = '',
  onChange,
  onOpenMention,
  candidates = [],
  placeholder = 'Start writing…',
}) {
  const ref = useRef(null)
  const fileRef = useRef(null)
  const [empty, setEmpty] = useState(!sanitizeNoteHtml(initialHtml).trim())
  const [picker, setPicker] = useState(null) // { items, index, top, left }

  // Dock the toolbar to the bottom of the visible viewport while you're typing
  // in this editor. Sticky-to-the-top was the wrong anchor on a phone: iOS pans
  // the whole layout viewport up to reveal the caret, and a sticky element is
  // pinned to the *scrollport*, which pans away with it — so the toolbar slid
  // up under the Dynamic Island and the nav bar above it left the screen
  // entirely. The bottom of the visible band can't pan away, and it's where iOS
  // Notes puts the same controls anyway: under the thumb.
  //
  // The condition is "touch device, single pane, editor focused" — pointedly
  // not "a keyboard is open". Detecting the keyboard is the part that kept
  // going wrong: an installed iOS app can shrink the layout viewport to make
  // room for one, which measures identically to no keyboard at all. Focus on a
  // touch screen means a keyboard is coming, and useVisualBandBottom reports an
  // absolute edge rather than an inset, so it needs no such detection: with a
  // keyboard the band ends at its top, without one it ends at the screen.
  const [focused, setFocused] = useState(false)
  const bandBottom = useVisualBandBottom()
  // Below 900px the note is the whole screen; at or above it the editor shares
  // the window with the index rail, where a bar spanning the viewport would
  // belong to neither pane.
  const dockable = useMediaQuery('(pointer: coarse) and (max-width: 899px)')
  const docked = focused && dockable
  // Sit the bar's bottom edge on the bottom edge of the visible band. No
  // threshold, no branch, and nothing that has to work out whether a keyboard
  // is open: wherever the band ends is where the bar belongs, keyboard or not.
  // translateY(-100%) is what makes `top` behave as a bottom edge, and saves
  // measuring the bar's own height to subtract it.
  const dockStyle = { top: bandBottom, transform: 'translateY(-100%)' }

  // Seed the editable once. (Remount via React key to switch notes.)
  useEffect(() => {
    ensureStyleWithTags()
    if (ref.current) ref.current.innerHTML = sanitizeNoteHtml(initialHtml)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emit = () => {
    if (!ref.current) return
    const html = sanitizeNoteHtml(ref.current.innerHTML)
    setEmpty(!html.replace(/<br>|<div><\/div>|&nbsp;/g, '').trim())
    onChange?.(html)
  }

  // Run a formatting command, keeping focus + selection (the button's
  // mousedown-preventDefault already held them), then sync state up.
  const exec = (command, value) => {
    ref.current?.focus()
    document.execCommand(command, false, value)
    emit()
  }

  // Block toggles: a heading or quote flips back to a plain paragraph on re-tap.
  const toggleBlock = (tag) => {
    const sel = window.getSelection()
    const inBlock = sel?.anchorNode?.parentElement?.closest(tag)
    exec('formatBlock', inBlock ? 'div' : tag)
  }

  // Checklist: turn the current line(s) into a checklist, or add a fresh item.
  const insertChecklist = () => {
    ref.current?.focus()
    document.execCommand('insertUnorderedList')
    const sel = window.getSelection()
    const ul = sel?.anchorNode?.parentElement?.closest('ul')
    if (ul) {
      ul.classList.add('checklist')
      ul.querySelectorAll('li').forEach((el) => {
        el.classList.add('checklist-item')
        if (!el.hasAttribute('data-checked')) el.setAttribute('data-checked', 'false')
      })
    }
    emit()
  }

  // Image: downscale to an inline data: URL and drop it in at the caret.
  const pickImage = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    fileToImageDataUrl(file)
      .then((dataUrl) => {
        ref.current?.focus()
        const sel = window.getSelection()
        if (!sel.rangeCount || !ref.current.contains(sel.anchorNode)) {
          const range = document.createRange()
          range.selectNodeContents(ref.current)
          range.collapse(false)
          sel.removeAllRanges()
          sel.addRange(range)
        }
        document.execCommand('insertImage', false, dataUrl)
        emit()
      })
      .catch((err) => showToast(err.message || 'Could not add image', { variant: 'error' }))
  }

  // Click handling: toggle a checkbox in its gutter, follow a mention chip, or
  // open a tapped link.
  const onEditorClick = (e) => {
    const chip = e.target.closest?.('span.mention')
    if (chip && ref.current?.contains(chip) && onOpenMention) {
      e.preventDefault()
      onOpenMention({ type: chip.getAttribute('data-type'), id: chip.getAttribute('data-id') })
      return
    }
    const li = e.target.closest?.('li.checklist-item')
    if (li && ref.current?.contains(li)) {
      const rect = li.getBoundingClientRect()
      if (e.clientX - rect.left <= 30) {
        li.setAttribute(
          'data-checked',
          li.getAttribute('data-checked') === 'true' ? 'false' : 'true',
        )
        emit()
        return
      }
    }
    const a = e.target.closest?.('a')
    if (a && ref.current?.contains(a) && a.href) {
      e.preventDefault()
      window.open(a.href, '_blank', 'noopener,noreferrer')
    }
  }

  const closePicker = () => setPicker(null)

  const refreshPicker = () => {
    const token = mentionToken()
    if (!token) return closePicker()
    const q = token.query.toLowerCase()
    const items = candidates.filter((c) => !q || c.label.toLowerCase().includes(q)).slice(0, 8)
    if (items.length === 0) return closePicker()
    const rect = token.range.getBoundingClientRect()
    setPicker({ items, index: 0, ...placePicker(rect, items.length) })
  }

  const onInput = () => {
    emit()
    refreshPicker()
  }

  // Replace the typed "@query" with an atomic mention chip + trailing space.
  const choose = (cand) => {
    const token = mentionToken()
    ref.current?.focus()
    const range = token ? token.range : window.getSelection().getRangeAt(0)
    range.deleteContents()
    const chip = document.createElement('span')
    chip.className = 'mention'
    chip.setAttribute('data-type', cand.type)
    chip.setAttribute('data-id', cand.id)
    chip.setAttribute('contenteditable', 'false')
    chip.textContent = `@${cand.label}`
    const space = document.createTextNode(' ')
    range.insertNode(space)
    range.insertNode(chip)
    const after = document.createRange()
    after.setStartAfter(space)
    after.collapse(true)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(after)
    closePicker()
    emit()
  }

  // Markdown shortcut: if the caret sits right after a line-start marker when
  // space is pressed, strip the marker and apply the block format instead.
  const maybeMarkdown = () => {
    const sel = window.getSelection()
    if (!sel.isCollapsed || sel.rangeCount === 0) return false
    const node = sel.anchorNode
    if (!node || node.nodeType !== 3 || node.previousSibling) return false // must be line start
    const before = node.nodeValue.slice(0, sel.anchorOffset)
    const action = MARKDOWN[before]
    if (!action) return false
    // Drop the marker text, then apply the format to the now-clean line.
    node.nodeValue = node.nodeValue.slice(sel.anchorOffset)
    const r = document.createRange()
    r.setStart(node, 0)
    r.collapse(true)
    sel.removeAllRanges()
    sel.addRange(r)
    if (action === 'heading') exec('formatBlock', 'h2')
    else if (action === 'quote') exec('formatBlock', 'blockquote')
    else if (action === 'bullet') exec('insertUnorderedList')
    else if (action === 'numbered') exec('insertOrderedList')
    else if (action === 'checklist') insertChecklist()
    return true
  }

  const onKeyDown = (e) => {
    if (picker) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setPicker((p) => ({ ...p, index: (p.index + 1) % p.items.length }))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setPicker((p) => ({ ...p, index: (p.index - 1 + p.items.length) % p.items.length }))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        choose(picker.items[picker.index])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        closePicker()
        return
      }
    }
    if (e.key === ' ' && maybeMarkdown()) e.preventDefault()
  }

  // Paste: sanitize incoming HTML (or escape plain text), linkify bare URLs, and
  // pull in any pasted image file — so the note never inherits foreign markup.
  const onPaste = (e) => {
    const items = e.clipboardData?.items || []
    for (const it of items) {
      if (it.type?.startsWith('image/')) {
        const file = it.getAsFile()
        if (file) {
          e.preventDefault()
          fileToImageDataUrl(file)
            .then((dataUrl) => {
              ref.current?.focus()
              document.execCommand('insertImage', false, dataUrl)
              emit()
            })
            .catch((err) => showToast(err.message || 'Could not add image', { variant: 'error' }))
          return
        }
      }
    }
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')
    const toInsert = html
      ? linkifyHtml(sanitizeNoteHtml(html))
      : linkifyHtml(escapeHtml(text).replace(/\r?\n/g, '<br>'))
    document.execCommand('insertHTML', false, toInsert)
    emit()
  }

  // On blur, turn freshly-typed bare URLs into links, then persist + close.
  const onBlur = () => {
    setFocused(false)
    if (ref.current) {
      const linked = linkifyHtml(ref.current.innerHTML)
      if (linked !== ref.current.innerHTML) ref.current.innerHTML = linked
    }
    emit()
    setTimeout(closePicker, 150)
  }

  useLayoutEffect(() => {
    if (!picker) return
    const onSel = () => {
      if (ref.current && ref.current.contains(window.getSelection()?.anchorNode)) refreshPicker()
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker])

  const tools = [
    { icon: Bold, label: 'Bold', run: () => exec('bold') },
    { icon: Italic, label: 'Italic', run: () => exec('italic') },
    { icon: Underline, label: 'Underline', run: () => exec('underline') },
    { icon: Type, label: 'Heading', run: () => toggleBlock('h2') },
    { icon: CheckSquare, label: 'Checklist', run: insertChecklist },
    { icon: List, label: 'Bulleted list', run: () => exec('insertUnorderedList') },
    { glyph: '1.', label: 'Numbered list', run: () => exec('insertOrderedList') },
    { glyph: '“', label: 'Quote', run: () => toggleBlock('blockquote') },
    { icon: ImageIcon, label: 'Image', run: () => fileRef.current?.click() },
    { icon: Minus, label: 'Divider', run: () => exec('insertHorizontalRule') },
  ]

  const toolbar = (
    <div
      className={`note-toolbar ${docked ? 'docked' : ''}`}
      // The one thing that can't be CSS: where the visible band currently ends.
      style={docked ? dockStyle : undefined}
    >
      <div className="note-toolbar-scroll" role="toolbar" aria-label="Formatting">
        {tools.map((t) => (
          <button
            key={t.label}
            type="button"
            className="note-tool"
            aria-label={t.label}
            title={t.label}
            // mousedown-preventDefault keeps the editor's selection intact.
            onMouseDown={(e) => {
              e.preventDefault()
              t.run()
            }}
          >
            {t.icon ? <t.icon size={18} /> : <span className="note-tool-glyph">{t.glyph}</span>}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="note-editor">
      {/* On a touch screen the bar exists only while you're typing. Unfocused
          there is no selection for Bold or Checklist to act on, so a resting
          toolbar is a row of controls that do nothing — it just sat at the top
          of the note taking up space and inviting taps that went nowhere. iOS
          Notes shows its own the same way: with the keyboard, or not at all.
          A mouse keeps the resting bar, where a click is cheap and the sticky
          row costs nothing. */}
      {/* Docked, the bar is rendered into <body> rather than left here, and
          that portal is the difference between working and invisible on an
          iPhone. `.main` carries -webkit-overflow-scrolling: touch, and iOS
          hoists position:fixed descendants of one of those into the scroller's
          own compositing layer — where they stop being viewport-relative and
          get clipped out of existence. It's the same reason the tab pill and
          the FAB are rendered outside .main and always have been; this bar was
          the one piece of fixed chrome sitting inside it. The portal also makes
          it immune to any transformed ancestor, which is a second way to lose a
          fixed element and one this app has hit before (see useEdgeBack).
          Undocked it stays put: sticky has to live in the scroller to stick. */}
      {dockable ? docked && createPortal(toolbar, document.body) : toolbar}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={pickImage}
        style={{ display: 'none' }}
      />

      <div className="note-editable-wrap">
        {empty && <div className="note-placeholder">{placeholder}</div>}
        <div
          ref={ref}
          className="note-editable"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Note body"
          onInput={onInput}
          onKeyDown={onKeyDown}
          onClick={onEditorClick}
          onPaste={onPaste}
          onFocus={() => setFocused(true)}
          onBlur={onBlur}
        />
      </div>

      {picker && (
        <ul
          className="mention-picker"
          style={{ position: 'fixed', top: picker.top, left: picker.left }}
          role="listbox"
        >
          {picker.items.map((c, i) => (
            <li key={`${c.type}:${c.id}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === picker.index}
                className={`mention-option ${i === picker.index ? 'active' : ''}`}
                // mousedown (not click) so it fires before the editor blur.
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(c)
                }}
              >
                <span className="mention-option-label">{c.label}</span>
                <span className="mention-option-type">{c.sub || c.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
