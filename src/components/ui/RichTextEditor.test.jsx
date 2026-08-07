import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import RichTextEditor from './RichTextEditor'

// Where the formatting bar renders, which is the whole ballgame on iOS.
//
// It shipped once as a plain `position: fixed` child of the editor and was
// invisible on a real iPhone: `.main` carries -webkit-overflow-scrolling: touch,
// and iOS pulls fixed descendants of one of those into the scroller's own
// compositing layer, where they stop being viewport-relative. Nothing in a
// desktop browser or in Playwright's iPhone emulation reproduces it — both
// place the element exactly where the CSS says — so the guarantee this test
// keeps is structural: while docked, the bar must not be inside the editor.

const LAYOUT_H = 844
const KEYBOARD_H = 336

function stubViewport(height, offsetTop = 0) {
  const listeners = { resize: new Set(), scroll: new Set() }
  const vv = {
    height,
    offsetTop,
    addEventListener: (type, fn) => listeners[type]?.add(fn),
    removeEventListener: (type, fn) => listeners[type]?.delete(fn),
    openKeyboard(h = KEYBOARD_H) {
      vv.height = LAYOUT_H - h
      listeners.resize.forEach((fn) => fn())
    },
    closeKeyboard() {
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
  })

  afterEach(() => {
    delete window.visualViewport
  })

  it('stays inside the editor with no keyboard — sticky has to live in the scroller to stick', () => {
    stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    expect(container.querySelector('.note-editor').contains(toolbar())).toBe(true)
    expect(toolbar().className).not.toContain('docked')
  })

  it('leaves the editor for <body> once the keyboard is up', () => {
    const vv = stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    act(() => vv.openKeyboard())

    const bar = toolbar()
    expect(bar.className).toContain('docked')
    expect(bar.parentElement).toBe(document.body)
    expect(container.querySelector('.note-editor').contains(bar)).toBe(false)
    // ...and its place in flow is held, so the text doesn't jump.
    expect(container.querySelector('.note-toolbar-spacer')).not.toBeNull()
  })

  it('sits on the keyboard, and follows it as iOS pans', () => {
    const vv = stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    act(() => vv.openKeyboard())
    expect(toolbar().style.bottom).toBe(`${KEYBOARD_H}px`)
    act(() => vv.panTo(120))
    expect(toolbar().style.bottom).toBe(`${KEYBOARD_H - 120}px`)
  })

  it('comes home when the keyboard closes', () => {
    const vv = stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    act(() => vv.openKeyboard())
    expect(toolbar().parentElement).toBe(document.body)

    act(() => vv.closeKeyboard())
    expect(container.querySelector('.note-editor').contains(toolbar())).toBe(true)
    expect(container.querySelector('.note-toolbar-spacer')).toBeNull()
  })

  it('does not dock while the editor is unfocused, keyboard or not', () => {
    const vv = stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    // A keyboard raised by some other field on the page is not ours to dock to.
    act(() => vv.openKeyboard())
    expect(container.querySelector('.note-editor').contains(toolbar())).toBe(true)
    expect(toolbar().className).not.toContain('docked')
  })

  it('undocks on blur so the tag field does not inherit the bar', () => {
    const vv = stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    focusBody(container)
    act(() => vv.openKeyboard())
    expect(toolbar().parentElement).toBe(document.body)

    blurBody(container)
    expect(container.querySelector('.note-editor').contains(toolbar())).toBe(true)
  })

  it('renders every tool wherever it lives', () => {
    const vv = stubViewport(LAYOUT_H)
    const { container } = render(<RichTextEditor />)
    expect(container.querySelectorAll('.note-tool')).toHaveLength(10)
    focusBody(container)
    act(() => vv.openKeyboard())
    expect(document.querySelectorAll('.note-tool')).toHaveLength(10)
  })
})
