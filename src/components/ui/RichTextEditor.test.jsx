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
// Playwright's iPhone emulation, honors the CSS exactly and pans rather than
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

  // Unfocused on a touch screen there is no selection for these to act on, so
  // the bar isn't rendered at all rather than sitting at the top of the note
  // being tappable and inert.
  it('is absent until focused on a touch screen', () => {
    stubViewport(LAYOUT_H)
    render(<RichTextEditor />)
    expect(toolbar()).toBeNull()
  })

  it('leaves the editor for <body> on focus', () => {
    stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    focusBody(container)

    const bar = toolbar()
    expect(bar.className).toContain('docked')
    expect(bar.parentElement).toBe(document.body)
    expect(container.querySelector('.note-editor').contains(bar)).toBe(false)
  })

  // A mouse keeps the resting bar: a click is cheap, the sticky row costs no
  // reach, and there is no keyboard to be pushed around by.
  it('stays in the editor on a desktop pointer, focused or not', () => {
    stubPointer({ touch: false })
    stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    expect(container.querySelector('.note-editor').contains(toolbar())).toBe(true)
    focusBody(container)
    expect(container.querySelector('.note-editor').contains(toolbar())).toBe(true)
    expect(toolbar().className).not.toContain('docked')
  })

  // The bar is anchored by its bottom edge, which is what the -100% translate
  // buys: `top` is where the visible band ends, and the element hangs upward
  // from it. No height measurement, no offset arithmetic against a viewport
  // that turned out not to be the one you can see.
  it('rests its bottom edge on the bottom of the visible band', () => {
    const vv = stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    act(() => vv.openKeyboardByPanning())

    expect(toolbar().style.top).toBe(`${LAYOUT_H - KEYBOARD_H}px`)
    expect(toolbar().style.transform).toBe('translateY(-100%)')
    expect(toolbar().style.bottom).toBe('')
  })

  it('follows the band as iOS pans to reveal the caret', () => {
    const vv = stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    act(() => vv.openKeyboardByPanning())
    act(() => vv.panTo(120))
    expect(toolbar().style.top).toBe(`${120 + (LAYOUT_H - KEYBOARD_H)}px`)
  })

  // The real numbers off the device that finally explained this, verbatim.
  // Every earlier version expressed the position as an inset from the bottom of
  // the layout viewport, and all of them died here: the band's bottom edge
  // (210 + 543 = 753) is *below* the layout viewport's own (684), so that inset
  // is negative and clamps to zero — parking the bar behind the keyboard. Where
  // the band ends is 753 regardless, which is why the anchor is absolute now.
  it('handles a band that extends past the layout viewport', () => {
    stubViewport(543, 210)
    window.innerHeight = 684
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    expect(toolbar().style.top).toBe('753px')
  })

  // Same trap from the other side: offsetTop 210 means `top: 0` is 210px above
  // the top of the screen, which is where the top-pinned attempt went.
  it('never anchors to the top of the layout viewport', () => {
    stubViewport(543, 210)
    window.innerHeight = 684
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    expect(toolbar().style.top).not.toBe('0px')
    expect(Number.parseInt(toolbar().style.top, 10)).toBeGreaterThan(210)
  })

  it('falls back to the layout viewport when visualViewport is missing', () => {
    delete window.visualViewport
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    expect(toolbar().parentElement).toBe(document.body)
    expect(toolbar().style.top).toBe(`${LAYOUT_H}px`)
  })

  it('goes away again on blur', () => {
    const vv = stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    act(() => vv.openKeyboardByPanning())
    expect(toolbar().parentElement).toBe(document.body)

    blurBody(container)
    expect(toolbar()).toBeNull()
  })

  it('does not appear for someone else’s keyboard', () => {
    const vv = stubViewport(LAYOUT_H)
    render(<RichTextEditor />)
    act(() => vv.openKeyboardByPanning())
    expect(toolbar()).toBeNull()
  })

  it('renders every tool once docked', () => {
    stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    expect(document.querySelectorAll('.note-tool')).toHaveLength(10)
  })
})
