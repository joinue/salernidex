import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSelection } from './useSelection'

vi.mock('../lib/haptics', () => ({ default: { light: vi.fn(), success: vi.fn() } }))

const ids = ['a', 'b', 'c']

describe('useSelection', () => {
  it('starts out not selecting', () => {
    const { result } = renderHook(() => useSelection(ids))
    expect(result.current.selecting).toBe(false)
    expect(result.current.count).toBe(0)
  })

  it('enters with the row you pressed already ticked', () => {
    // Otherwise a long-press costs a second tap to say what you already said.
    const { result } = renderHook(() => useSelection(ids))
    act(() => result.current.enter('b'))
    expect(result.current.selecting).toBe(true)
    expect(result.current.isSelected('b')).toBe(true)
    expect(result.current.count).toBe(1)
  })

  it('toggles rows in and out', () => {
    const { result } = renderHook(() => useSelection(ids))
    act(() => result.current.enter('a'))
    act(() => result.current.toggle('c'))
    expect(result.current.count).toBe(2)
    act(() => result.current.toggle('a'))
    expect(result.current.isSelected('a')).toBe(false)
    expect(result.current.count).toBe(1)
  })

  it('selects and clears everything on screen', () => {
    const { result } = renderHook(() => useSelection(ids))
    act(() => result.current.enter())
    act(() => result.current.toggleAll())
    expect(result.current.count).toBe(3)
    expect(result.current.allSelected).toBe(true)
    act(() => result.current.toggleAll())
    expect(result.current.count).toBe(0)
  })

  it('exits empty', () => {
    const { result } = renderHook(() => useSelection(ids))
    act(() => result.current.enter('a'))
    act(() => result.current.exit())
    expect(result.current.selecting).toBe(false)
    expect(result.current.count).toBe(0)
  })

  it('drops a row that stops being visible', () => {
    // A housemate checks it off, the lens filters it out, or this very
    // selection deleted it. A bulk action must never reach a row the user can
    // no longer see.
    const { result, rerender } = renderHook(({ list }) => useSelection(list), {
      initialProps: { list: ids },
    })
    act(() => result.current.enter('a'))
    act(() => result.current.toggle('c'))
    rerender({ list: ['a', 'b'] })
    expect(result.current.count).toBe(1)
    expect(result.current.isSelected('c')).toBe(false)
  })

  it('keeps the same Set when nothing was pruned', () => {
    // Consumers memoise on it; a fresh Set every render would defeat that.
    const { result, rerender } = renderHook(({ list }) => useSelection(list), {
      initialProps: { list: ids },
    })
    act(() => result.current.enter('a'))
    const before = result.current.selected
    rerender({ list: [...ids] })
    expect(result.current.selected).toBe(before)
  })

  it('runs an action over the selection in list order, then exits', () => {
    // Set iteration order is insertion order, so ticking c then a would
    // otherwise hand the caller ['c', 'a'] — wrong for a copy.
    const { result } = renderHook(() => useSelection(ids))
    act(() => result.current.enter('c'))
    act(() => result.current.toggle('a'))
    const fn = vi.fn()
    act(() => result.current.run(fn))
    expect(fn).toHaveBeenCalledWith(['a', 'c'])
    expect(result.current.selecting).toBe(false)
  })

  it('does nothing for an empty selection', () => {
    const { result } = renderHook(() => useSelection(ids))
    act(() => result.current.enter())
    const fn = vi.fn()
    act(() => result.current.run(fn))
    expect(fn).not.toHaveBeenCalled()
    // Still selecting: nothing happened, so there is nothing to leave.
    expect(result.current.selecting).toBe(true)
  })

  it('leaves on Escape, like any other overlay', () => {
    const { result } = renderHook(() => useSelection(ids))
    act(() => result.current.enter('a'))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(result.current.selecting).toBe(false)
  })

  it('ignores Escape when it is not selecting', () => {
    const { result } = renderHook(() => useSelection(ids))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(result.current.selecting).toBe(false)
  })
})
