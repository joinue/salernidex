import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft } from 'react-feather'
import { useVisualBandTop } from '../../hooks/useKeyboardOpen'

// iOS navigation bar for detail screens: a sticky frosted strip carrying Back
// and any trailing actions, with the page's large title underneath. Scroll the
// large title away and its text collapses into the centre of the bar, the way
// UINavigationController does it.
//
// Replaces the hand-rolled `← Back` link every detail page used to open with.
// That link scrolled off with the content, so on a long person page the only
// way back was to scroll to the top first (edge-swipe helped, but it's
// invisible, and it doesn't help a thumb reaching for the top of the screen).
//
//   <NavBar backLabel="Lists" onBack={onBack} title={list.name} actions={…}>
//     …the large title block…
//   </NavBar>
//
// `children` is the page's own header treatment (avatar + name + chips on a
// person, emoji + name on a list). Pass none and it renders `title` as a plain
// large title.
//
// `pinned` is for screens you type into — the note editor. Sticky holds the bar
// against the *scrollport*, and iOS reveals the caret by moving the scrollport,
// so on a phone the bar leaves the screen the moment you tap into the text and
// stays gone for as long as the keyboard is up: no Back, no title, and the body
// text jammed against the status bar with nothing holding that space. Pinned,
// the bar is fixed to the top of the visible band instead, which is where Apple
// Notes keeps its own. Off by default — every other detail screen scrolls, and
// the collapse-into-the-bar handoff is nicer when the bar belongs to the page.
export default function NavBar({
  backLabel = 'Back',
  onBack,
  title,
  actions,
  children,
  pinned = false,
}) {
  const largeRef = useRef(null)
  const [collapsed, setCollapsed] = useState(false)
  const bandTop = useVisualBandTop()

  useEffect(() => {
    const el = largeRef.current
    if (!el || !('IntersectionObserver' in window)) return
    // The bar is ~44px tall and sticky, so shrink the observation root by that
    // much: the title counts as "gone" once it's behind the bar, not once it
    // has left the viewport entirely.
    const io = new IntersectionObserver(([entry]) => setCollapsed(!entry.isIntersecting), {
      rootMargin: '-52px 0px 0px 0px',
      threshold: 0,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const header = (
    <header
      className={`navbar ${pinned ? 'pinned' : ''}`}
      // Where the visible band starts. Not 0: with a keyboard up iOS pushes the
      // band down inside the layout viewport, so 0 is off the top of the screen.
      style={pinned ? { top: bandTop } : undefined}
    >
      <button className="navbar-back" onClick={onBack}>
        <ChevronLeft size={22} aria-hidden="true" />
        <span>{backLabel}</span>
      </button>
      {/* aria-hidden: the large title below is the real heading, and this is
          the same text. Announcing both would just be a stutter. */}
      <div className={`navbar-title ${collapsed ? 'shown' : ''}`} aria-hidden="true">
        {title}
      </div>
      {actions ? <div className="navbar-actions">{actions}</div> : <span />}
    </header>
  )

  return (
    <>
      {/* Portalled, not just fixed. `.main` carries
          -webkit-overflow-scrolling: touch, and iOS hoists fixed descendants of
          one of those into the scroller's own compositing layer, where they
          stop being viewport-relative — the same trap the notes toolbar fell
          into. Out here it can't happen. */}
      {pinned ? createPortal(header, document.body) : header}
      {/* Fixed means out of flow, so the page needs the height back or the
          title slides up underneath the bar. */}
      {pinned && <div className="navbar-pinned-spacer" aria-hidden="true" />}
      <div className="navbar-large" ref={largeRef}>
        {children || <h1 className="large-title">{title}</h1>}
      </div>
    </>
  )
}
