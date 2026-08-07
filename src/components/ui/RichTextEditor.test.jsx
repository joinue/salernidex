import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import RichTextEditor from './RichTextEditor'

// Where the formatting bar renders, which is the whole ballgame on iOS.
//
// Two bugs shipped here, one after the other, and both are pinned below.
//
// First it was a plain `position: fixed` child of the editor and was invisible
// on a real iPhone: `.main` carries -webkit-overflow-scrolling: touch, and iOS
// hoists fixed descendants of one of those into the scroller's own compositing
// layer, where they stop being viewport-relative. Hence the portal to <body>.
//
// Then it docked only when it could measure a keyboard — and an installed iOS
// app makes room for one by *shrinking the layout viewport*, which measures
// identically to no keyboard at all. The bar stayed sticky at the top of the
// page, under the Dynamic Island, which was the original complaint. So the
// trigger is now focus on a touch screen, and the offset is whatever the
// viewports say it is.
//
// Nothing available here reproduces either bug — Chrome, headless or in
// Playwright's iPhone emulation, honours the CSS exactly and pans rather than
// shrinks. So these tests pin structure and arithmetic, not pixels.

const LAYOUT_H = 844
const KEYBOARD_H = 336
const DOCK_QUERY = '(pointer: coarse) and (max-width: 899px)'

function stubViewport(height, offsetTop = 0) {
  const listeners = { resize: new Set(), scroll: new Set() }
  const vv = {
    height,
    offsetTop,
    addEventListener: (type, fn) => listeners[type]?.add(fn),
    removeEventListener: (type, fn) => listeners[type]?.delete(fn),
    // Safari in a tab: the layout viewport is left whole and gets panned.
    openKeyboardByPanning(h = KEYBOARD_H) {
      vv.height = LAYOUT_H - h
      listeners.resize.forEach((fn) => fn())
    },
    // An installed standalone app: the layout viewport shrinks instead, so the
    // two viewports still agree and there is nothing to detect.
    openKeyboardByShrinking(h = KEYBOARD_H) {
      window.innerHeight = LAYOUT_H - h
      vv.height = LAYOUT_H - h
      listeners.resize.forEach((fn) => fn())
    },
    closeKeyboard() {
      window.innerHeight = LAYOUT_H
      vv.height = LAYOUT_H
      listeners.resize.forEach((fn) => fn())
    },
    panTo(next) {
      vv.offsetTop = next
      listeners.scroll.forEach((fn) => fn())
    },
  }
  window.visualViewport = vv
  return vv
}

// jsdom has no matchMedia; src/test/setup.js defaults every query to false,
// which is the desktop branch. Say which device we're on.
function stubPointer({ touch }) {
  window.matchMedia = (q) => ({
    matches: q === DOCK_QUERY ? touch : false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })
}

const toolbar = () => document.querySelector('.note-toolbar')
// focusin/focusout, not focus/blur: React delegates onFocus/onBlur to the
// bubbling pair, and the non-bubbling ones never reach its root listener.
const fire = (container, type) =>
  act(() => {
    container.querySelector('.note-editable').dispatchEvent(new FocusEvent(type, { bubbles: true }))
  })
const focusBody = (container) => fire(container, 'focusin')
const blurBody = (container) => fire(container, 'focusout')

describe('RichTextEditor formatting bar', () => {
  beforeEach(() => {
    window.innerHeight = LAYOUT_H
    stubPointer({ touch: true })
  })

  afterEach(() => {
    delete window.visualViewport
    window.innerHeight = LAYOUT_H
  })

  it('stays inside the editor until focused — sticky has to live in the scroller to stick', () => {
    stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    expect(container.querySelector('.note-editor').contains(toolbar())).toBe(true)
    expect(toolbar().className).not.toContain('docked')
  })

  it('leaves the editor for <body> on focus', () => {
    stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    focusBody(container)

    const bar = toolbar()
    expect(bar.className).toContain('docked')
    expect(bar.parentElement).toBe(document.body)
    expect(container.querySelector('.note-editor').contains(bar)).toBe(false)
    // ...and its place in flow is held, so the text doesn't jump.
    expect(container.querySelector('.note-toolbar-spacer')).not.toBeNull()
  })

  it('never docks on a desktop pointer, focused or not', () => {
    stubPointer({ touch: false })
    stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    expect(container.querySelector('.note-editor').contains(toolbar())).toBe(true)
    expect(toolbar().className).not.toContain('docked')
  })

  it('sits on the keyboard, and follows it as iOS pans', () => {
    const vv = stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    act(() => vv.openKeyboardByPanning())
    expect(toolbar().style.bottom).toBe(`${KEYBOARD_H}px`)
    act(() => vv.panTo(120))
    expect(toolbar().style.bottom).toBe(`${KEYBOARD_H - 120}px`)
  })

  it('follows the keyboard as far as the bottom of the visible band', () => {
    const vv = stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    act(() => vv.openKeyboardByPanning())
    expect(toolbar().className).toContain('at-bottom')
  })

  // The one that took three tries. Some installed iOS apps report the keyboard
  // through visualViewport and some report nothing whatsoever, so a gap of 0 is
  // ambiguous: it means either "no keyboard" or "a keyboard I can't see". As a
  // bottom offset it puts the bar behind the keyboard, invisible, which is the
  // worse reading of the two. Pin it to the top instead — never measured, never
  // hidden — and let CSS clear the status bar.
  it('pins to the top when the keyboard is unmeasurable, rather than behind it', () => {
    const vv = stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    act(() => vv.openKeyboardByShrinking())

    const bar = toolbar()
    expect(bar.parentElement).toBe(document.body)
    expect(bar.className).toContain('docked')
    expect(bar.className).toContain('at-top')
    // No inline bottom at all — the offset that would have buried it.
    expect(bar.style.bottom).toBe('')
  })

  // The one that made the top branch unreachable in practice. A 50px gap is a
  // home indicator or a half-finished pan, not a keyboard — but it is > 0, so
  // an earlier cut trusted it as the offset that clears one and parked the bar
  // 50px off the bottom of the screen, under ~340px of keys.
  it('does not mistake a small gap for the keyboard', () => {
    const vv = stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    act(() => vv.openKeyboardByPanning(50))

    expect(toolbar().className).toContain('at-top')
    expect(toolbar().style.bottom).toBe('')
  })

  it('pins to the top when visualViewport is missing entirely', () => {
    delete window.visualViewport
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    expect(toolbar().className).toContain('at-top')
    expect(toolbar().parentElement).toBe(document.body)
  })

  it('comes home on blur', () => {
    const vv = stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    act(() => vv.openKeyboardByPanning())
    expect(toolbar().parentElement).toBe(document.body)

    blurBody(container)
    expect(container.querySelector('.note-editor').contains(toolbar())).toBe(true)
    expect(container.querySelector('.note-toolbar-spacer')).toBeNull()
  })

  it('does not dock for someone else’s keyboard', () => {
    const vv = stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    act(() => vv.openKeyboardByPanning())
    expect(container.querySelector('.note-editor').contains(toolbar())).toBe(true)
    expect(toolbar().className).not.toContain('docked')
  })

  it('renders every tool wherever it lives', () => {
    stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    expect(container.querySelectorAll('.note-tool')).toHaveLength(10)
    focusBody(container)
    expect(document.querySelectorAll('.note-tool')).toHaveLength(10)
  })
})
