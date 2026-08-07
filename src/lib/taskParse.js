import { describeRecurrence, nextOccurrence } from './recurrence'

// Natural-language parsing for task quick-add. Pure + (almost) dependency-free
// so it's unit-testable and reusable. Turns a typed line like
//   "take the trash out every monday"
//   "call mom friday"
//   "pay rent on the 1st for Marc"
// into { title, due_date, recurrence, assignee, tokens } using the SAME shapes
// the rest of the app already speaks: recurrence rules per lib/recurrence.js,
// a member-id assignee per lib/household.js, and 'YYYY-MM-DD' dates.
//
// Design stance: CONSERVATIVE. It only strips text it's confident about, parses
// at most one due date and one recurrence, and never returns an empty title.
// Manual form fields always win over what's parsed (see TaskForm) — this just
// fills the blanks.

const WEEKDAYS = {
  sunday: 0,
  sundays: 0,
  sun: 0,
  monday: 1,
  mondays: 1,
  mon: 1,
  tuesday: 2,
  tuesdays: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wednesdays: 3,
  wed: 3,
  weds: 3,
  thursday: 4,
  thursdays: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fridays: 5,
  fri: 5,
  saturday: 6,
  saturdays: 6,
  sat: 6,
}
const MONTHS = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
}
const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, last: -1 }
const WD =
  'sun(?:days?)?|mon(?:days?)?|tue(?:s|sdays?)?|wed(?:s|nesdays?)?|thu(?:r|rs|rsday)?s?|thursdays?|fri(?:days?)?|sat(?:urdays?)?'
const MON =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'

// Prepositions that mark a date as a DEADLINE ("by Friday") rather than the day
// to act on ("on Friday"). Longest phrase first so the alternation can't settle
// for a shorter partial match. See the 'on' vs 'by' block in parseTaskInput.
const DEADLINE_PREP = 'no later than|before|by'

const pad = (n) => String(n).padStart(2, '0')
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromISO = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()
const clampDay = (y, m, day) => new Date(y, m, Math.min(day, daysInMonth(y, m)))
// Keep recurrence intervals sane: "every 99999 days" must not turn into a
// 37-million-iteration scan in nextOccurrence. 1..999 covers any real cadence.
const clampInterval = (n) => Math.min(999, Math.max(1, n || 1))

const FILLER = new Set([
  'on',
  'by',
  'before',
  'at',
  'for',
  'every',
  'each',
  'this',
  'next',
  'the',
  'and',
  '&',
  'in',
  'to',
  'starting',
  'repeat',
  'repeats',
  'due',
])

function tidy(s) {
  let prev
  let out = s.replace(/\s+/g, ' ').trim()
  do {
    prev = out
    out = out.replace(/^[\s,.;:–—-]+/, '').replace(/[\s,.;:–—-]+$/, '')
    const parts = out.split(' ')
    if (parts.length > 1 && FILLER.has(parts[0].toLowerCase())) out = parts.slice(1).join(' ')
    const tail = parts[parts.length - 1]
    if (parts.length > 1 && FILLER.has(tail.toLowerCase())) out = out.slice(0, out.lastIndexOf(' '))
  } while (out !== prev)
  return out
}

// Coming date for a target weekday: smallest delta >= 0 (today counts).
function comingWeekday(base, target) {
  const delta = (target - base.getDay() + 7) % 7
  return addDays(base, delta)
}

export function parseTaskInput(text, { today, members = [] } = {}) {
  const original = (text || '').trim()
  const out = {
    title: original,
    due_date: null,
    due_kind: 'on', // 'by' when the date was introduced as a deadline (see below)
    due_time: null,
    recurrence: null,
    assignee: null,
    tokens: [],
  }
  if (!original) return out

  const base = today
    ? fromISO(today)
    : (() => {
        const n = new Date()
        return new Date(n.getFullYear(), n.getMonth(), n.getDate())
      })()
  const todayISO = toISO(base)
  let rest = ` ${original} `

  // Splice a matched span out of `rest`.
  const cut = (mm) => {
    rest = `${rest.slice(0, mm.index)} ${rest.slice(mm.index + mm[0].length)}`
  }
  // Cut a regex match out of `rest`, returning the match array (or null).
  const take = (re) => {
    const mm = re.exec(rest)
    if (!mm) return null
    cut(mm)
    return mm
  }

  // ---- recurrence (try the most specific phrasings first) ----
  let rule = null
  const weekdaysFrom = (str) =>
    [...str.matchAll(new RegExp(`(${WD})`, 'gi'))]
      .map((mm) => WEEKDAYS[mm[1].toLowerCase()])
      .filter((n) => n != null)
  let m
  if ((m = take(new RegExp(`\\b(?:every|each)\\s+other\\s+day\\b`, 'i')))) {
    rule = { freq: 'daily', interval: 2, anchor: todayISO }
  } else if ((m = take(new RegExp(`\\b(?:every|each)\\s+(\\d+)\\s+days?\\b`, 'i')))) {
    rule = { freq: 'daily', interval: clampInterval(+m[1]), anchor: todayISO }
  } else if ((m = take(/\b(?:every\s*day|each\s+day|everyday|daily)\b/i))) {
    rule = { freq: 'daily', interval: 1, anchor: todayISO }
  } else if ((m = take(/\bevery\s+weekday\b/i))) {
    rule = { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5], anchor: todayISO }
  } else if ((m = take(/\bevery\s+weekends?\b/i))) {
    rule = { freq: 'weekly', interval: 1, weekdays: [0, 6], anchor: todayISO }
  } else if ((m = take(/\b(?:every\s+other\s+week|biweekly|fortnightly)\b/i))) {
    rule = { freq: 'weekly', interval: 2, weekdays: [base.getDay()], anchor: todayISO }
  } else if ((m = take(/\b(?:every|each)\s+(\d+)\s+weeks?\b/i))) {
    rule = {
      freq: 'weekly',
      interval: clampInterval(+m[1]),
      weekdays: [base.getDay()],
      anchor: todayISO,
    }
  } else if (
    (m = take(
      new RegExp(
        `\\b(?:every|each)\\s+other\\s+((?:${WD})(?:\\s*(?:,|and|&|/)\\s*(?:${WD}))*)\\b`,
        'i',
      ),
    ))
  ) {
    // "every other tuesday" / "every other mon and thu" → fortnightly on those days
    const wds = [...new Set(weekdaysFrom(m[1]))].sort((a, b) => a - b)
    rule = {
      freq: 'weekly',
      interval: 2,
      weekdays: wds.length ? wds : [base.getDay()],
      anchor: todayISO,
    }
  } else if (
    (m = take(
      new RegExp(`\\b(?:every|each)\\s+((?:${WD})(?:\\s*(?:,|and|&|/)\\s*(?:${WD}))*)\\b`, 'i'),
    ))
  ) {
    const wds = [...new Set(weekdaysFrom(m[1]))].sort((a, b) => a - b)
    rule = {
      freq: 'weekly',
      interval: 1,
      weekdays: wds.length ? wds : [base.getDay()],
      anchor: todayISO,
    }
  } else if (
    (m = new RegExp(
      `\\b(?:every\\s+)?(${Object.keys(ORDINALS).join('|')})\\s+(${WD})(?:\\s+of\\s+(?:the\\s+|every\\s+|each\\s+)?month)?\\b`,
      'i',
    ).exec(rest)) &&
    /every|of\s+(?:the\s+|every\s+|each\s+)?month/i.test(m[0])
  ) {
    // Only a recurrence if anchored by "every" or "of the month" — otherwise
    // "first Monday" is a one-off and we leave it for the date matcher.
    cut(m)
    rule = {
      freq: 'monthly',
      interval: 1,
      setpos: ORDINALS[m[1].toLowerCase()],
      weekday: WEEKDAYS[m[2].toLowerCase()],
      anchor: todayISO,
    }
  } else if (
    (m = take(/\b(?:(?:every|each)\s+month|monthly)\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/i))
  ) {
    rule = { freq: 'monthly', interval: 1, monthday: Math.min(31, +m[1]), anchor: todayISO }
  } else if ((m = take(/\b(?:every|each)\s+(\d+)\s+months?\b/i))) {
    rule = {
      freq: 'monthly',
      interval: clampInterval(+m[1]),
      monthday: base.getDate(),
      anchor: todayISO,
    }
  } else if ((m = take(/\b(?:every\s+month|monthly)\b/i))) {
    rule = { freq: 'monthly', interval: 1, monthday: base.getDate(), anchor: todayISO }
  } else if (
    (m = take(
      new RegExp(
        `\\b(?:(?:every|each)\\s+year|yearly|annually)\\s+on\\s+(${MON})\\.?\\s+(\\d{1,2})\\b`,
        'i',
      ),
    ))
  ) {
    rule = {
      freq: 'yearly',
      interval: 1,
      month: MONTHS[m[1].toLowerCase()],
      monthday: +m[2],
      anchor: todayISO,
    }
  } else if ((m = take(/\b(?:every|each)\s+(\d+)\s+years?\b/i))) {
    rule = {
      freq: 'yearly',
      interval: clampInterval(+m[1]),
      month: base.getMonth(),
      monthday: base.getDate(),
      anchor: todayISO,
    }
  } else if ((m = take(/\b(?:every\s+year|yearly|annually)\b/i))) {
    rule = {
      freq: 'yearly',
      interval: 1,
      month: base.getMonth(),
      monthday: base.getDate(),
      anchor: todayISO,
    }
  } else if ((m = take(/\b(?:every|each)\s+week\b/i))) {
    rule = { freq: 'weekly', interval: 1, weekdays: [base.getDay()], anchor: todayISO }
  }
  const ruleText = rule ? m[0].trim() : '' // the phrase we matched, for title rebuild

  // ---- due date (one-off) — first confident hit wins ----
  let due = null
  let dueText = ''
  const set = (d) => {
    if (!due) {
      due = toISO(d)
      dueText = m[0].trim()
    }
  }
  if ((m = take(/\bday\s+after\s+tomorrow\b/i))) set(addDays(base, 2))
  else if ((m = take(/\b(?:tomorrow|tmrw|tmr|tomo)\b/i))) set(addDays(base, 1))
  else if ((m = take(/\b(?:today|tonight)\b/i))) set(base)
  else if ((m = take(/\bthis\s+weekend\b/i))) set(comingWeekday(base, 6))
  else if ((m = take(/\bnext\s+week\b/i))) set(addDays(base, 7))
  else if ((m = take(new RegExp(`\\b(this|next)\\s+(${WD})\\b`, 'i')))) {
    let d = comingWeekday(base, WEEKDAYS[m[2].toLowerCase()])
    if (/next/i.test(m[1])) d = addDays(d, d.getTime() === base.getTime() ? 7 : 7)
    set(d)
  } else if ((m = take(/\bin\s+(\d+|a|an)\s+(day|week|month)s?\b/i))) {
    const n = /a|an/i.test(m[1]) ? 1 : +m[1]
    if (/month/i.test(m[2])) set(clampDay(base.getFullYear(), base.getMonth() + n, base.getDate()))
    else set(addDays(base, n * (/week/i.test(m[2]) ? 7 : 1)))
  } else if (
    (m = take(
      new RegExp(`\\b(?:on|${DEADLINE_PREP})?\\s*the\\s+(\\d{1,2})(?:st|nd|rd|th)\\b`, 'i'),
    ))
  ) {
    const day = +m[1]
    let d = clampDay(base.getFullYear(), base.getMonth(), day)
    if (d < base) d = clampDay(base.getFullYear(), base.getMonth() + 1, day)
    set(d)
  } else if (
    (m = take(
      new RegExp(`\\b(${MON})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, 'i'),
    ))
  ) {
    set(monthDayYear(MONTHS[m[1].toLowerCase()], +m[2], m[3], base))
  } else if (
    (m = take(
      new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MON})\\.?(?:,?\\s*(\\d{4}))?\\b`, 'i'),
    ))
  ) {
    set(monthDayYear(MONTHS[m[2].toLowerCase()], +m[1], m[3], base))
  } else if (
    (m = take(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)) ||
    (m = take(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/))
  ) {
    // Slash form "6/20" (optional year) OR dash form that REQUIRES a 4-digit
    // year — so "buy 2-4 apples" / "kids 3-5" aren't misread as dates.
    const mo = +m[1] - 1,
      day = +m[2]
    if (mo >= 0 && mo <= 11 && day >= 1 && day <= 31) {
      let yr = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : base.getFullYear()
      let d = clampDay(yr, mo, day)
      if (!m[3] && d < base) d = clampDay(yr + 1, mo, day)
      set(d)
    }
  } else if ((m = take(new RegExp(`\\b(${WD})\\b`, 'i')))) {
    set(comingWeekday(base, WEEKDAYS[m[1].toLowerCase()]))
  }

  // ---- 'on' vs 'by': which preposition introduced the date ----
  // "gutters BY aug 20" is a deadline you're free to beat; "dentist ON aug 20"
  // (or a bare "aug 20") pins the task to the day. The word was already being
  // typed and thrown away as filler — this is just reading it. Both were
  // interchangeable before, so a missing preposition keeps the old meaning.
  //
  // The preposition is folded into the token's text so titleFrom() eats the
  // whole phrase — otherwise a mid-sentence "by" survives into the title
  // ("email bob by about taxes") — and so dismissing the chip puts it back.
  let dueKind = 'on'
  if (due) {
    if (new RegExp(`^(?:${DEADLINE_PREP})\\b`, 'i').test(dueText)) {
      dueKind = 'by' // the matcher already swallowed it ("by the 1st")
    } else {
      const padded = ` ${original} `
      const at = padded.toLowerCase().indexOf(dueText.toLowerCase())
      const lead =
        at > 0 ? new RegExp(`\\b(${DEADLINE_PREP})\\s+$`, 'i').exec(padded.slice(0, at)) : null
      if (lead) {
        dueKind = 'by'
        dueText = `${lead[1]} ${dueText}`
      }
    }
  }

  // ---- time of day: "at 3pm", "at 3:30pm", "at 15:00" ----
  // Requires am/pm or a colon, so "at the 1st", "buy 2 apples", "at home" never
  // read as a time. A time without a date is left for TaskForm to pin to today.
  let dueTime = null
  let timeText = ''
  if ((m = take(/\bat\s+(\d{1,2}):(\d{2})\s*(am|pm)?\b/i))) {
    dueTime = to24(+m[1], +m[2], m[3])
    timeText = m[0].trim()
  } else if ((m = take(/\bat\s+(\d{1,2})\s*(am|pm)\b/i))) {
    dueTime = to24(+m[1], 0, m[2])
    timeText = m[0].trim()
  }

  // ---- assignee: "@name" or "for <member>", only if it matches a member ----
  const matchMember = (word) => {
    const w = word.toLowerCase()
    return members.find((mem) => {
      const name = (mem.name || '').toLowerCase()
      return name === w || name.split(/\s+/)[0] === w
    })
  }
  let whoText = ''
  if ((m = /\s@(\w+)\b/.exec(rest))) {
    const mem = matchMember(m[1])
    if (mem) {
      out.assignee = mem.id
      whoText = `@${m[1]}`
    }
  }
  if (!out.assignee && (m = /\bfor\s+(\w+)\b/i.exec(rest))) {
    const mem = matchMember(m[1])
    if (mem) {
      out.assignee = mem.id
      whoText = m[0].trim()
    }
  }

  // ---- reconcile + finalize ----
  // Each token carries the text it ate, so the title can be rebuilt keeping only
  // the tokens the user didn't dismiss (see TaskForm's per-chip toggles).
  if (rule) {
    if (due) rule.anchor = due // an explicit start date phases the recurrence
    out.recurrence = rule
    out.tokens.push({ type: 'repeat', label: describeRecurrence(rule), text: ruleText })
  }
  if (due) {
    out.due_date = due
    out.due_kind = dueKind
    // The chip says "by Friday" for a deadline, plain "Friday" for a fixed day —
    // so the distinction the parser just made is visible before you save.
    const label = formatDue(due, todayISO)
    out.tokens.push({
      type: 'due',
      label: dueKind === 'by' ? `by ${label}` : label,
      text: dueText,
    })
  }
  if (dueTime) {
    out.due_time = dueTime
    out.tokens.push({ type: 'time', label: formatTime(dueTime), text: timeText })
  }
  if (out.assignee) {
    const mem = members.find((x) => x.id === out.assignee)
    if (mem) out.tokens.push({ type: 'who', label: mem.name, text: whoText })
  }

  out.title = titleFrom(original, out.tokens)
  return out
}

// Rebuild a clean title from the original text minus the given tokens' matched
// phrases. With all tokens it's the fully-cleaned title; with a subset it keeps
// the phrases for any token the user chose to ignore.
export function titleFrom(original, tokens = []) {
  let s = ` ${original} `
  for (const t of tokens) {
    if (!t.text) continue
    const i = s.toLowerCase().indexOf(t.text.toLowerCase())
    if (i >= 0) s = `${s.slice(0, i)} ${s.slice(i + t.text.length)}`
  }
  return tidy(s) || original.trim()
}

// One-line natural-language text → a ready-to-save task payload, applying every
// parsed token (no manual overrides). Powers the inline quick-add bar. Mirrors
// the "parsed fills blanks" half of TaskForm.submit so a task typed into the bar
// lands identically to one typed into the modal's title field and saved as-is.
export function quickTaskFields(text, { today, members = [] } = {}) {
  const parsed = parseTaskInput(text, { today, members })
  // A recurring task with no explicit date gets its first due date from the rule,
  // so it lands on the calendar immediately (matches TaskForm).
  let due = parsed.due_date
  if (parsed.recurrence && !due) due = nextOccurrence(parsed.recurrence, today, { inclusive: true })
  // A time of day only means something with a date; "at 3pm" with no date pins to
  // today, as Apple does.
  if (parsed.due_time && !due) due = today
  return {
    title: parsed.title,
    recurrence: parsed.recurrence,
    assignee: parsed.assignee || 'anyone',
    due_date: due,
    // Only an explicitly parsed date can be a deadline — a date derived from a
    // recurrence rule or from a bare time of day is a day to act ON.
    due_kind: due && due === parsed.due_date ? parsed.due_kind : 'on',
    due_time: due ? parsed.due_time : null,
  }
}

function monthDayYear(month, day, yearStr, base) {
  let year = yearStr ? (yearStr.length === 2 ? 2000 + +yearStr : +yearStr) : base.getFullYear()
  let d = clampDay(year, month, day)
  if (!yearStr && d < base) d = clampDay(year + 1, month, day)
  return d
}

// (hour, minute, 'am'|'pm'|undefined) → 'HH:MM' 24h, or null if out of range.
// Without a meridiem the hour is taken as already 24h (e.g. "at 15:00").
function to24(h, min, meridiem) {
  let hh = h
  if (meridiem) {
    const pm = /pm/i.test(meridiem)
    if (pm && hh < 12) hh += 12
    if (!pm && hh === 12) hh = 0
  }
  if (hh > 23 || min > 59) return null
  return `${pad(hh)}:${pad(min)}`
}

// Compact time for the preview chip — mirrors lib/tasks.timeLabel (kept local so
// the parser stays self-contained, like formatDue).
function formatTime(t) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 || 12
  return m ? `${h12}:${pad(m)} ${ampm}` : `${h12} ${ampm}`
}

// Short due label for the preview chip (parser-local so it doesn't depend on
// the real "today").
function formatDue(iso, todayISO) {
  const d = fromISO(iso)
  const diff = Math.round((d - fromISO(todayISO)) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
