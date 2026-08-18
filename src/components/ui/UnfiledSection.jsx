import { useState } from 'react'
import SectionLabel from './SectionLabel'

// "No area · 12" — the collapsed section that holds unfiled items while a lens
// is active.
//
// It exists because neither obvious option was right. Mixing unfiled items into
// the lens makes the lens quietly leaky; hiding them entirely makes it airtight
// but silently swallows anything you forgot to file, and the first time that
// happens the feature stops being trustworthy. A collapsed section is explicit,
// costs one row of height, and does the nudging a silent rule can't.
//
// It also softens a real divergence: every workspace switcher people know
// (Linear, Notion, Slack, Superlist) is a HARD boundary where nothing leaks.
// This one leaks on purpose, so it says so out loud rather than surprising you.
//
// One component, used by every scoped view, because the section has to look and
// behave the same on Today as it does on Notes — seven bespoke versions is how
// it ends up meaning seven slightly different things.
export default function UnfiledSection({ count, label = 'No area', children }) {
  const [open, setOpen] = useState(false)
  if (!count) return null
  return (
    <>
      <SectionLabel
        action={
          <button className="text-btn" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Show'}
          </button>
        }
      >
        {label} · {count}
      </SectionLabel>
      {open && children}
    </>
  )
}
