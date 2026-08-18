import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RemindersView from './RemindersView'

// The page makes a claim in its own footnote — birthdays and key dates arrive
// here from your contacts — and for most of the year nothing on screen backed
// it up: the upcoming list stops at 30 days, so a household whose next birthday
// was in August saw the promise and an empty page. These cover the section that
// answers it, and the one case where the promise itself has to change.

// Noon on Fri 2026-06-12, like reminders.test.js.
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-06-12T12:00:00'))
})
afterEach(() => {
  vi.useRealTimers()
})

const person = (id, name, birthday) => ({ id, name, birthday, avatar_url: null })

// Six, so the preview cap has something to hold back.
const PEOPLE = [
  person('p1', 'Ada Lovelace', '1990-09-04'),
  person('p2', 'Grace Hopper', '1906-12-09'),
  person('p3', 'Alan Turing', '1912-06-23'), // 11 days out: upcoming, not the roster
  person('p4', 'Katherine Johnson', '1918-08-26'),
  person('p5', 'Jean Bartik', '1924-12-27'),
  person('p6', 'Mary Jackson', '1921-04-09'),
  person('p7', 'Annie Easley', '1933-04-23'),
]

const setup = ({
  people = PEOPLE,
  keyDates = [],
  reminders = [],
  onOpenPerson = vi.fn(),
  focusId,
  area = null,
} = {}) => {
  const data = {
    reminders,
    people,
    keyDates,
    completeTask: vi.fn(),
    deleteTask: vi.fn(),
  }
  render(
    <RemindersView
      data={data}
      focusId={focusId}
      onAdd={vi.fn()}
      onEdit={vi.fn()}
      onOpenPerson={onOpenPerson}
      area={area}
    />,
  )
  return { onOpenPerson }
}

// The row a link named, e.g. from Today's Coming up section.
const marked = () => document.querySelector('.row-focus')

describe('RemindersView contact dates', () => {
  it('lists the year’s birthdays even when nothing is coming up', () => {
    setup()
    expect(screen.getByText('Later in the year')).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace turns 36')).toBeInTheDocument()
    // The date, not "in 84d": a number that big stops being a date.
    expect(screen.getByText('Sep 4')).toBeInTheDocument()
  })

  it('keeps the ones already in the upcoming list out of it', () => {
    setup()
    // Alan's birthday is 11 days out, so it sits under "Later this month" and
    // must not appear twice on the same screen.
    expect(screen.getAllByText('Alan Turing turns 114')).toHaveLength(1)
  })

  it('shows a handful and holds the rest behind Show all', async () => {
    const user = userEvent.setup()
    setup()
    expect(screen.queryByText('Annie Easley turns 94')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show all' }))
    expect(screen.getByText('Annie Easley turns 94')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(screen.queryByText('Annie Easley turns 94')).not.toBeInTheDocument()
  })

  it('opens the contact a date belongs to, since it can only be edited there', async () => {
    const user = userEvent.setup()
    const { onOpenPerson } = setup()
    await user.click(screen.getByText('Ada Lovelace turns 36'))
    expect(onOpenPerson).toHaveBeenCalledWith('p1')
  })

  it('includes key dates, not just birthdays', () => {
    setup({
      people: [person('p1', 'Ada Lovelace', null)],
      keyDates: [{ id: 'k1', person_id: 'p1', date: '2015-09-04', annual: true, label: 'Wedding' }],
    })
    expect(screen.getByText('Ada Lovelace · Wedding')).toBeInTheDocument()
  })

  it('stops promising dates it has none of', () => {
    setup({ people: [person('p1', 'Ada Lovelace', null)] })
    expect(screen.queryByText('Later in the year')).not.toBeInTheDocument()
    expect(screen.getByText(/No birthdays or key dates on file yet/)).toBeInTheDocument()
    expect(screen.queryByText(/are read from your contacts/)).not.toBeInTheDocument()
  })
})

// #/reminders/<id>: tapping a reminder on Today brings you here, to that
// reminder. This page mixes what you wrote with what it worked out from your
// contacts and runs to five sections, so "it's on the page somewhere" is not
// the same as having been taken to it.
describe('RemindersView — landing on one named reminder', () => {
  const REMINDERS = [
    { id: 'r1', title: 'Bin day', due_date: '2026-06-13', assignee: 'anyone' },
    { id: 'r2', title: 'Renew the MOT', due_date: '2026-06-14', assignee: 'anyone' },
  ]

  it('marks the one it was sent to, and only that one', () => {
    setup({ people: [], reminders: REMINDERS, focusId: 'r2' })
    expect(marked()).toHaveTextContent('Renew the MOT')
    expect(document.querySelectorAll('.row-focus')).toHaveLength(1)
  })

  it('marks nothing when no reminder was named', () => {
    setup({ people: [], reminders: REMINDERS })
    expect(marked()).toBeNull()
  })

  // Reminders carry an area, so under a lens an unfiled one falls into the
  // collapsed section — where a link that "took you to it" would leave it
  // behind a fold you'd have to know to open.
  it('opens the No area section when that is where it sits', () => {
    setup({
      people: [],
      area: 'a-work',
      focusId: 'r1',
      reminders: [{ ...REMINDERS[0] }, { ...REMINDERS[1], area_id: 'a-work' }],
    })
    expect(screen.getByText('Bin day')).toBeInTheDocument()
    expect(marked()).toHaveTextContent('Bin day')
  })
})
