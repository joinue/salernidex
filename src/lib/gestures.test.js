import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { swallowNextClick, DRAG_EXEMPT_SELECTOR } from './gestures'

describe('swallowNextClick', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  const clickTarget = () => {
    const btn = document.createElement('button')
    const onClick = vi.fn()
    btn.addEventListener('click', onClick)
    document.body.appendChild(btn)
    return { btn, onClick }
  }

  it('stops the click that follows a drag from reaching the row underneath', () => {
    const { btn, onClick } = clickTarget()
    swallowNextClick()
    btn.click()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('only swallows one click, so the next real tap still works', () => {
    const { btn, onClick } = clickTarget()
    swallowNextClick()
    btn.click()
    btn.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('expires if no click follows, rather than eating an unrelated later tap', () => {
    const { btn, onClick } = clickTarget()
    swallowNextClick()
    vi.advanceTimersByTime(100)
    btn.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('DRAG_EXEMPT_SELECTOR', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  // Sheet's drag-to-dismiss consults this before claiming a gesture. If a
  // textarea ever stopped matching, dragging to select text inside a sheet
  // would dismiss it and discard what was typed.
  it.each(['input', 'textarea', 'select'])('exempts <%s>', (tag) => {
    const el = document.createElement(tag)
    document.body.appendChild(el)
    expect(el.closest(DRAG_EXEMPT_SELECTOR)).toBe(el)
  })

  it('exempts contenteditable regions and anything opting out by hand', () => {
    document.body.innerHTML = `<div contenteditable="true" id="a"></div><div data-no-drag id="b"></div>`
    expect(document.getElementById('a').closest(DRAG_EXEMPT_SELECTOR)).toBeTruthy()
    expect(document.getElementById('b').closest(DRAG_EXEMPT_SELECTOR)).toBeTruthy()
  })

  it('does not exempt an ordinary row', () => {
    document.body.innerHTML = `<div class="list-row" id="r"></div>`
    expect(document.getElementById('r').closest(DRAG_EXEMPT_SELECTOR)).toBeNull()
  })
})
