import { useEffect, useRef, useState } from 'react'
import { ChevronLeft } from 'react-feather'

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
export default function NavBar({ backLabel = 'Back', onBack, title, actions, children }) {
  const largeRef = useRef(null)
  const [collapsed, setCollapsed] = useState(false)

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

  return (
    <>
      <header className="navbar">
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
      <div className="navbar-large" ref={largeRef}>
        {children || <h1 className="large-title">{title}</h1>}
      </div>
    </>
  )
}
