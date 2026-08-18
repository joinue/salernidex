import { useState } from 'react'
import { Archive, Bell, Edit2, Plus, Search, Star, Trash2, Users } from 'react-feather'
import PageHeader from '../../components/shell/PageHeader'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Chip from '../../components/ui/Chip'
import EmptyState from '../../components/ui/EmptyState'
import Field from '../../components/ui/Field'
import IconButton from '../../components/ui/IconButton'
import IconPicker from '../../components/ui/IconPicker'
import SectionLabel from '../../components/ui/SectionLabel'
import Segmented from '../../components/ui/Segmented'
import StatTile, { StatGrid } from '../../components/ui/StatTile'
import Stepper from '../../components/ui/Stepper'
import Sheet from '../../components/ui/Sheet'
import SelectRow from '../../components/ui/SelectRow'
import Modal from '../../components/ui/Modal'
import { useConfirm } from '../../hooks/useConfirm'
import { showToast } from '../../lib/toast'

// Every primitive, in every state it ships in, on one page.
//
// This is the reference for "what does the app already have" — check here
// before inventing a control, and add a specimen here when you add one. It's
// also the fastest way to review a token change: resize to 375px, flip the
// theme, and the whole vocabulary is on screen at once.
//
// Dev-only: App gates the route on import.meta.env.DEV, so it never ships.
export default function KitchenSink() {
  const [seg, setSeg] = useState('a')
  const [count, setCount] = useState(3)
  const [sheet, setSheet] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [tier, setTier] = useState('')
  const [icon, setIcon] = useState('')
  const [modal, setModal] = useState(false)
  const confirm = useConfirm()

  return (
    <div>
      <PageHeader
        title="Kitchen sink"
        subtitle="Every primitive, every state"
        createAction={() => {}}
        actionLabel="Nothing"
        info="Dev-only reference page. Add a specimen here whenever you add a primitive."
        infoTitle="What is this?"
      />

      <SectionLabel>Buttons</SectionLabel>
      <Card padded>
        <div className="ks-row">
          <Button onClick={() => showToast({ message: 'Primary' })}>Primary</Button>
        </div>
        <div className="ks-row">
          <Button variant="pill" icon={Star}>
            Pill
          </Button>
          <Button variant="pill" tone="danger" icon={Archive}>
            Pill danger
          </Button>
          <Button variant="text" icon={Plus}>
            Text
          </Button>
          <Button variant="text" tone="danger" icon={Trash2}>
            Text danger
          </Button>
        </div>
        <div className="ks-row">
          <Button disabled>Disabled</Button>
        </div>
      </Card>

      <SectionLabel>Icon buttons</SectionLabel>
      <Card padded>
        <div className="ks-row">
          <IconButton icon={Edit2} label="Edit" />
          <IconButton icon={Trash2} variant="danger" label="Delete" />
          <IconButton icon={Bell} variant="accent" size="md" label="Notify" />
          <IconButton icon={Search} size="lg" label="Search" />
        </div>
        <p className="muted ks-note">
          All four tap at 44px whatever they paint at. Verified by
          <code> scripts/mobile-audit.mjs</code>.
        </p>
      </Card>

      <SectionLabel>Chips</SectionLabel>
      <Card padded>
        <div className="ks-row">
          <Chip>neutral</Chip>
          <Chip tone="accent">accent</Chip>
          <Chip tone="danger">2d overdue</Chip>
          <Chip tone="success">done</Chip>
          <Chip tone="warning">someday</Chip>
        </div>
        <div className="ks-row">
          <Chip icon={Users} onClick={() => {}} active>
            toggled
          </Chip>
          <Chip onClick={() => {}}>tappable</Chip>
          <Chip onRemove={() => {}}>removable</Chip>
        </div>
      </Card>

      <SectionLabel>Segmented + stepper</SectionLabel>
      <Card padded>
        <Segmented
          options={[
            { value: 'a', label: 'One' },
            { value: 'b', label: 'Two' },
            { value: 'c', label: 'Three' },
          ]}
          value={seg}
          onChange={setSeg}
        />
        <div className="ks-row">
          <Stepper value={count} onChange={setCount} label="glasses" />
          <Stepper value={0} onChange={() => {}} min={0} label="at minimum" />
        </div>
      </Card>

      <SectionLabel>Select row</SectionLabel>
      <Card padded>
        <SelectRow
          label="Tier"
          value={tier}
          onChange={setTier}
          placeholder="All tiers"
          options={[
            { value: '', label: 'All tiers' },
            { value: 'family', label: 'Family' },
            { value: 'inner', label: 'Inner circle' },
          ]}
        />
        <SelectRow
          label="A very long current value"
          value="x"
          onChange={() => {}}
          options={[{ value: 'x', label: 'Truncates rather than pushing the chevron off' }]}
        />
      </Card>

      <SectionLabel>Icon picker</SectionLabel>
      <Card padded>
        <IconPicker value={icon} onChange={setIcon} />
        <p className="muted ks-note">
          The compact row, plus “⋯” for the full catalog. The catalog opens as its own sheet rather
          than unfolding here — a scrolling grid with a search field in it, nested inside a
          scrolling form sheet, is the shape the keyboard has nowhere to go.
        </p>
      </Card>

      <SectionLabel>Fields</SectionLabel>
      <Card padded>
        <Field label="Name">{(id) => <input id={id} placeholder="Tap the label" />}</Field>
        <Field label="Email" hint="Only your household sees this.">
          {(id) => <input id={id} type="email" placeholder="you@example.com" />}
        </Field>
        <Field label="Due">{(id) => <input id={id} type="date" />}</Field>
        <Field label="Join code" error="That code has expired.">
          {(id) => <input id={id} defaultValue="ABC123" />}
        </Field>
      </Card>

      <SectionLabel>Stats</SectionLabel>
      <StatGrid>
        <StatTile value="18" unit="days" label="Streak" />
        <StatTile value="100%" label="30-day" />
        <StatTile value="Mon" unit="100%" label="Best day" />
        <StatTile value="4" unit="days" label="Days hit" />
        <StatTile value="flat" label="Trend" />
      </StatGrid>

      <SectionLabel action={<Button variant="text">See all</Button>}>
        Section label with an action
      </SectionLabel>
      <Card>
        <div className="list-row">
          <div className="row-body">
            <div className="row-title">A list row</div>
            <div className="row-sub">with a subtitle</div>
          </div>
        </div>
        <div className="list-row">
          <div className="row-body">
            <div className="row-title">Another row</div>
          </div>
        </div>
      </Card>

      <SectionLabel>Empty states</SectionLabel>
      <Card padded>
        <EmptyState inline>Inline, for a section with nothing in it.</EmptyState>
      </Card>
      <EmptyState
        icon={Users}
        action={
          <Button variant="text" icon={Plus}>
            Add someone
          </Button>
        }
      >
        Full, with an icon and a way forward.
      </EmptyState>
      <EmptyState loading>Loading</EmptyState>

      <SectionLabel>Overlays</SectionLabel>
      <Card padded>
        <div className="ks-row">
          <Button variant="pill" onClick={() => setSheet(true)}>
            Sheet
          </Button>
          <Button variant="pill" onClick={() => setDrawer(true)}>
            Sheet side=right
          </Button>
          <Button variant="pill" onClick={() => setModal(true)}>
            Modal
          </Button>
          <Button
            variant="pill"
            tone="danger"
            onClick={async () => {
              const ok = await confirm({
                title: 'Delete this thing?',
                message: 'Say what the user loses, not "are you sure".',
                confirmLabel: 'Delete',
              })
              showToast({ message: ok ? 'Confirmed' : 'Cancelled' })
            }}
          >
            Confirm
          </Button>
          <Button
            variant="pill"
            onClick={() =>
              showToast({ message: 'Task deleted', actionLabel: 'Undo', onAction: () => {} })
            }
          >
            Toast
          </Button>
        </div>
      </Card>

      {sheet && (
        <Sheet title="A sheet" onClose={() => setSheet(false)}>
          <button className="sheet-item" onClick={() => setSheet(false)}>
            <Star size={20} /> An item
          </button>
          <button className="sheet-item danger" onClick={() => setSheet(false)}>
            <Trash2 size={20} /> A destructive item
          </button>
        </Sheet>
      )}

      {/* The drawer variant, which the mobile nav menu is built on: full height
          against the right edge, flick right to dismiss, and its own Close at
          the foot where the thumb that opened it already is. */}
      {drawer && (
        <Sheet side="right" title="A drawer" onClose={() => setDrawer(false)}>
          <button className="sheet-item" onClick={() => setDrawer(false)}>
            <Star size={20} /> A destination
          </button>
          <button className="sheet-item" onClick={() => setDrawer(false)}>
            <Star size={20} /> Another one
          </button>
        </Sheet>
      )}

      {modal && (
        <Modal title="A form sheet" onClose={() => setModal(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setModal(false)
            }}
          >
            {Array.from({ length: 8 }, (_, i) => (
              <Field key={i} label={`Field ${i + 1}`}>
                {(id) => <input id={id} placeholder="Scroll: the button stays put" />}
              </Field>
            ))}
            <button className="btn-primary">Save</button>
          </form>
        </Modal>
      )}
    </div>
  )
}
