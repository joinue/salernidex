import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isSelectionActive,
  resetSelectionMode,
  setSelectionActive,
  subscribeSelectionMode,
} from './selectionMode'

describe('selectionMode', () => {
  beforeEach(() => resetSelectionMode())

  it('is off until a surface says otherwise', () => {
    expect(isSelectionActive()).toBe(false)
  })

  it('reports active while a surface is selecting', () => {
    const a = Symbol('a')
    setSelectionActive(a, true)
    expect(isSelectionActive()).toBe(true)
    setSelectionActive(a, false)
    expect(isSelectionActive()).toBe(false)
  })

  it('survives a double-invoked effect without stranding the chrome', () => {
    // React StrictMode runs effects twice. A counter would drift here and leave
    // the tab bar hidden forever; membership by token cannot.
    const a = Symbol('a')
    setSelectionActive(a, true)
    setSelectionActive(a, true)
    setSelectionActive(a, false)
    expect(isSelectionActive()).toBe(false)
  })

  it('stays active while any surface still is', () => {
    const a = Symbol('a')
    const b = Symbol('b')
    setSelectionActive(a, true)
    setSelectionActive(b, true)
    setSelectionActive(a, false)
    expect(isSelectionActive()).toBe(true)
    setSelectionActive(b, false)
    expect(isSelectionActive()).toBe(false)
  })

  it('notifies only when the answer changes', () => {
    // Two surfaces handing over must not flicker the tab bar between them.
    const fn = vi.fn()
    const off = subscribeSelectionMode(fn)
    const a = Symbol('a')
    const b = Symbol('b')
    setSelectionActive(a, true) // false → true
    setSelectionActive(b, true) // still true
    expect(fn).toHaveBeenCalledTimes(1)
    setSelectionActive(a, false) // still true
    expect(fn).toHaveBeenCalledTimes(1)
    setSelectionActive(b, false) // true → false
    expect(fn).toHaveBeenCalledTimes(2)
    off()
  })

  it('stops notifying once unsubscribed', () => {
    const fn = vi.fn()
    subscribeSelectionMode(fn)()
    setSelectionActive(Symbol('a'), true)
    expect(fn).not.toHaveBeenCalled()
  })
})
