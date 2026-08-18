import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'

// The behavior under test is the one the UI actually feels: a page full of
// avatars must cost ONE signing round-trip, and an avatar that has already been
// signed must render on the first frame rather than after another one.

let signed
vi.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrls: (paths, ttl) => signed(paths, ttl),
      }),
    },
  },
}))

const { useAvatarSrc, resetAvatarCache } = await import('./avatarStorage')

// Renders one Avatar's worth of resolution and records what it saw each render,
// so we can assert on the FIRST value, not just the settled one.
function Probe({ path, seen }) {
  const src = useAvatarSrc(path)
  seen.push(src)
  return <span data-testid="src">{src || ''}</span>
}

beforeEach(() => {
  resetAvatarCache()
  signed = vi.fn(async (paths) => ({
    data: paths.map((path) => ({
      path,
      signedUrl: `https://cdn.test/${path}?token=x`,
      error: null,
    })),
    error: null,
  }))
})

describe('useAvatarSrc', () => {
  it('signs every path on the page in a single request', async () => {
    const paths = Array.from({ length: 12 }, (_, i) => `house/people/${i}.jpg`)
    render(
      <>
        {paths.map((p) => (
          <Probe key={p} path={p} seen={[]} />
        ))}
      </>,
    )
    await waitFor(() => expect(signed).toHaveBeenCalledTimes(1))
    expect(signed.mock.calls[0][0]).toEqual(paths)
  })

  it('asks once for a path that appears many times', async () => {
    const path = 'house/people/shared.jpg'
    render(
      <>
        <Probe path={path} seen={[]} />
        <Probe path={path} seen={[]} />
        <Probe path={path} seen={[]} />
      </>,
    )
    await waitFor(() => expect(signed).toHaveBeenCalledTimes(1))
    expect(signed.mock.calls[0][0]).toEqual([path])
  })

  it('renders a cached signature on the first frame, with no second request', async () => {
    const path = 'house/orgs/acme.jpg'
    const cold = []
    const { unmount } = render(<Probe path={path} seen={cold} />)
    await waitFor(() => expect(cold.at(-1)).toContain('cdn.test'))
    expect(cold[0]).toBeNull() // cold: monogram first, photo after the round-trip
    unmount()

    const warm = []
    render(<Probe path={path} seen={warm} />)
    expect(warm[0]).toContain('cdn.test') // warm: photo immediately
    expect(signed).toHaveBeenCalledTimes(1)
  })

  it('never goes to the network for a value that is already a URL', async () => {
    const seen = []
    render(<Probe path="data:image/jpeg;base64,abc" seen={seen} />)
    expect(seen[0]).toBe('data:image/jpeg;base64,abc')
    await act(async () => {})
    expect(signed).not.toHaveBeenCalled()
  })

  it('falls back to the monogram when signing fails, and retries later', async () => {
    signed = vi.fn(async () => {
      throw new Error('offline')
    })
    const seen = []
    const { unmount } = render(<Probe path="house/people/a.jpg" seen={seen} />)
    await waitFor(() => expect(signed).toHaveBeenCalledTimes(1))
    expect(seen.at(-1)).toBeNull()
    unmount()

    // A failure is not cached, so the next mount tries again.
    render(<Probe path="house/people/a.jpg" seen={[]} />)
    await waitFor(() => expect(signed).toHaveBeenCalledTimes(2))
  })
})
