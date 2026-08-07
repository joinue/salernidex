import { useEffect, useRef, useState } from 'react'

// TEMPORARY — delete this file and its one use in RichTextEditor.
//
// Four attempts at putting the note's formatting bar above the keyboard have
// failed on the installed iOS app, each on a different theory of what the
// viewport is doing, and none of them reproducible in any browser available
// here: Chrome, headless or emulating an iPhone, pans and reports honestly.
// So this stops guessing and prints what iOS actually says.
//
// It renders in normal flow inside the note, deliberately. Every previous
// attempt to place something reliably was itself the thing under test —
// a probe that can vanish tells you nothing. This one is ordinary content: if
// the note body is on screen, so is this.
//
// The row that matters is `bar:`, which reports where the browser really put
// the toolbar, in screen coordinates, whatever the CSS asked for.
export default function ViewportProbe() {
  const [, tick] = useState(0)
  const raf = useRef(0)

  useEffect(() => {
    // Poll rather than only listen: the interesting moment is mid-keyboard,
    // and an engine that fires no visualViewport events (which is one of the
    // live theories) would leave an event-driven probe frozen and lying.
    const id = setInterval(() => {
      cancelAnimationFrame(raf.current)
      raf.current = requestAnimationFrame(() => tick((n) => n + 1))
    }, 250)
    return () => {
      clearInterval(id)
      cancelAnimationFrame(raf.current)
    }
  }, [])

  const vv = window.visualViewport
  const main = document.querySelector('.main')
  const bar = document.querySelector('.note-toolbar')
  const barRect = bar?.getBoundingClientRect()
  const r = (n) => (n == null ? '–' : Math.round(n))

  const rows = [
    ['window', `inner ${r(window.innerHeight)}  outer ${r(window.outerHeight)}`],
    ['docEl', `client ${r(document.documentElement.clientHeight)}`],
    [
      'visualVP',
      vv
        ? `h ${r(vv.height)}  offTop ${r(vv.offsetTop)}  pageTop ${r(vv.pageTop)}  scale ${vv.scale}`
        : 'ABSENT',
    ],
    ['scroll', `win ${r(window.scrollY)}  main ${r(main?.scrollTop)}/${r(main?.scrollHeight)}`],
    ['main box', `top ${r(main?.getBoundingClientRect().top)} h ${r(main?.clientHeight)}`],
    [
      'bar',
      bar
        ? `${getComputedStyle(bar).position}  top ${r(barRect.top)}  bot ${r(barRect.bottom)}  h ${r(barRect.height)}`
        : 'NOT IN DOM',
    ],
    ['bar cls', bar ? bar.className.replace('note-toolbar', '').trim() || '(none)' : '–'],
    ['bar parent', bar ? bar.parentElement.tagName.toLowerCase() : '–'],
    [
      'env',
      `standalone ${window.navigator.standalone ?? matchMedia('(display-mode: standalone)').matches}  coarse ${matchMedia('(pointer: coarse) and (max-width: 899px)').matches}`,
    ],
    ['active', document.activeElement?.className || document.activeElement?.tagName || '–'],
  ]

  return (
    <div className="viewport-probe">
      <b>viewport probe — screenshot this with the keyboard up</b>
      {rows.map(([k, v]) => (
        <div key={k}>
          <span>{k}</span>
          {v}
        </div>
      ))}
    </div>
  )
}
