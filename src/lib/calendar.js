// Task → calendar bridge. A task with only a due date exports as an all-day
// event; one with a due_time becomes a 1-hour event in floating local time.
// Three ways out, all client-side — no OAuth, no backend, no lock-in
// (same philosophy as vcard.js):
//   • taskToIcs / downloadTaskIcs — the RFC 5545 standard. Opening the .ics on
//     iPhone/Mac lands it in Apple Calendar; it also imports into Google/Outlook.
//   • googleCalendarUrl — deep link that pre-fills a Google Calendar event.
//   • outlookCalendarUrl — deep link that pre-fills an Outlook web event.
// The user "picks a calendar" by which one they tap — there's no API to push
// into someone's calendar without their auth, so we hand off and let them save.

const WEEKDAYS_RR = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] // 0=Sun … 6=Sat

// 'YYYY-MM-DD' → 'YYYYMMDD' (the ICS / Google all-day form).
function compact(iso) {
  return iso.replace(/-/g, '')
}

// The day after an ISO date, in local time. All-day DTEND and Google's end date
// are *exclusive*, so a one-day event ends on due_date + 1.
function nextDay(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const nd = new Date(y, m - 1, d + 1)
  return `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-${String(nd.getDate()).padStart(2, '0')}`
}

// Today in local time, as a fallback for undated tasks — "add to calendar"
// should still do something sensible when there's no due date.
function todayIso() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

const pad2 = (n) => String(n).padStart(2, '0')
const minutesOf = (t) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}
// minutes-from-midnight → 'HHMMSS' (wraps past midnight; the date is bumped
// separately when an event's hour spills into the next day).
const hhmmss = (min) => `${pad2(Math.floor(min / 60) % 24)}${pad2(min % 60)}00`

// Resolve a task's event span in the forms each target wants. All-day events use
// YYYYMMDD with an *exclusive* end (due_date + 1). A timed task (due_time set)
// becomes a 1-hour event in floating local time — no TZID, so it lands in
// whatever calendar the user opens it in at that wall-clock time.
function spanFor(task) {
  const start = task.due_date || todayIso()
  if (!task.due_time) {
    const end = nextDay(start)
    return {
      ics: [`DTSTART;VALUE=DATE:${compact(start)}`, `DTEND;VALUE=DATE:${compact(end)}`],
      google: `${compact(start)}/${compact(end)}`,
      outlook: { startdt: start, enddt: end, allday: 'true' },
    }
  }
  const startMin = minutesOf(task.due_time)
  const endMin = startMin + 60
  const endDate = endMin >= 1440 ? nextDay(start) : start
  return {
    ics: [
      `DTSTART:${compact(start)}T${hhmmss(startMin)}`,
      `DTEND:${compact(endDate)}T${hhmmss(endMin)}`,
    ],
    google: `${compact(start)}T${hhmmss(startMin)}/${compact(endDate)}T${hhmmss(endMin)}`,
    outlook: {
      startdt: `${start}T${pad2(Math.floor(startMin / 60) % 24)}:${pad2(startMin % 60)}:00`,
      enddt: `${endDate}T${pad2(Math.floor(endMin / 60) % 24)}:${pad2(endMin % 60)}:00`,
      allday: 'false',
    },
  }
}

// Map our recurrence rule (see recurrence.js) to an RRULE value (no "RRULE:"
// prefix). Returns null for one-offs / unknown shapes.
export function recurrenceToRrule(rule) {
  if (!rule || !rule.freq) return null
  const interval = rule.interval && rule.interval > 1 ? `;INTERVAL=${rule.interval}` : ''
  // UNTIL bounds the exported series so a synced calendar ends it too. As a DATE
  // value (matching our all-day/floating DTSTART), it's the compact YYYYMMDD form.
  const until = rule.until ? `;UNTIL=${compact(rule.until)}` : ''
  let core
  switch (rule.freq) {
    case 'daily':
      core = `FREQ=DAILY${interval}`
      break
    case 'weekly': {
      const days = (rule.weekdays || []).map((w) => WEEKDAYS_RR[w]).filter(Boolean)
      core = `FREQ=WEEKLY${interval}${days.length ? `;BYDAY=${days.join(',')}` : ''}`
      break
    }
    case 'monthly':
      core = rule.setpos
        ? // setpos -1 = last; RRULE writes the ordinal straight onto the day token.
          `FREQ=MONTHLY${interval};BYDAY=${rule.setpos}${WEEKDAYS_RR[rule.weekday]}`
        : `FREQ=MONTHLY${interval};BYMONTHDAY=${rule.monthday}`
      break
    case 'yearly':
      // rule.month is 0-indexed; BYMONTH is 1-indexed.
      core = `FREQ=YEARLY${interval};BYMONTH=${rule.month + 1};BYMONTHDAY=${rule.monthday}`
      break
    default:
      return null
  }
  return core + until
}

// Fold per RFC 5545: content lines over 75 octets continue on a line starting
// with a single space. (vcard.js folds the same way.)
function fold(line) {
  const out = []
  let rest = line
  while (rest.length > 75) {
    out.push(rest.slice(0, 75))
    rest = ' ' + rest.slice(75)
  }
  out.push(rest)
  return out.join('\r\n')
}

// Escape TEXT values per RFC 5545: backslash, newline, comma, semicolon.
function esc(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

// Free-text description from the task's optional fields, newline-joined.
function description(task) {
  const lines = []
  if (task.area) lines.push(`Area: ${task.area}`)
  if (task.notes) lines.push(task.notes)
  return lines.join('\n')
}

// A single VEVENT wrapped in a VCALENDAR. `dtstamp` (UTC basic format) is
// injected so output is deterministic in tests; downloadTaskIcs stamps it live.
export function taskToIcs(task, { dtstamp } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Salernidex//Tasks//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    // Stable UID so re-importing the same task updates rather than duplicating.
    `UID:salernidex-task-${task.id}@salernidex`,
    `DTSTAMP:${dtstamp || '00000000T000000Z'}`,
    ...spanFor(task).ics,
    `SUMMARY:${esc(task.title)}`,
  ]
  const desc = description(task)
  if (desc) lines.push(`DESCRIPTION:${esc(desc)}`)
  const rrule = recurrenceToRrule(task.recurrence)
  if (rrule) {
    lines.push(`RRULE:${rrule}`)
    // Skipped occurrences ("skip this one") become EXDATEs so the synced calendar
    // drops them too. EXDATE must match DTSTART's value type — timed events carry
    // the same time of day, all-day events use VALUE=DATE.
    const exdates = task.recurrence?.exdates
    if (exdates?.length) {
      lines.push(
        task.due_time
          ? `EXDATE:${exdates.map((d) => `${compact(d)}T${hhmmss(minutesOf(task.due_time))}`).join(',')}`
          : `EXDATE;VALUE=DATE:${exdates.map(compact).join(',')}`,
      )
    }
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.map(fold).join('\r\n')
}

// Trigger a .ics download — opens in Apple Calendar on Apple devices, imports
// into Google/Outlook elsewhere. Mirrors vcard.js's downloadVcf.
export function downloadTaskIcs(task) {
  const now = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const dtstamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}T${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z`
  const blob = new Blob([taskToIcs(task, { dtstamp })], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = (task.title || 'task').replace(/[\\/:*?"<>|]/g, '').trim() + '.ics'
  a.click()
  // Defer the revoke so the browser finishes reading the blob first (see vcard).
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// Deep link that opens Google Calendar's event composer, pre-filled. All-day
// span uses the YYYYMMDD/YYYYMMDD form (end exclusive); recurring tasks pass the
// rule through Google's `recur` param.
export function googleCalendarUrl(task) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: task.title || '',
    dates: spanFor(task).google,
  })
  const desc = description(task)
  if (desc) params.set('details', desc)
  const rrule = recurrenceToRrule(task.recurrence)
  if (rrule) params.set('recur', `RRULE:${rrule}`)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

// Deep link into Outlook web's event composer. The deep link can't express
// recurrence, so a recurring task lands as a single all-day event there.
export function outlookCalendarUrl(task) {
  const span = spanFor(task)
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: task.title || '',
    startdt: span.outlook.startdt,
    enddt: span.outlook.enddt,
    allday: span.outlook.allday,
  })
  const desc = description(task)
  if (desc) params.set('body', desc)
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`
}
