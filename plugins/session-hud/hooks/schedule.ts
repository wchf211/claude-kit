// Reads ~/claude-kit/schedule.md: your regular breaks plus dated changes.
// The same file is copied in session-hud and daily-journal; keep both copies in sync.
//
//   - weekdays 17:30 end of work
//   - Tue,Thu 15:15 kids pickup
//   - daily 22:30 bedtime
//   - 2026-10-14 16:00 end of work (dentist)      replaces that day's "end of work"
//   - 2026-11-26 off Thanksgiving                  drops that day's regular entries, except "daily" ones
//   - 2026-12-21..2027-01-02 off winter break      a date range works for both forms

export type BreakTime = { minute: number; label: string }

export type Day = { iso: string; weekday: number }

const DAY_MINUTES = 24 * 60
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const LINE = /^\s*[-*]\s+(\S+)\s+(?:(\d{1,2}):(\d{2})|(off))\b\s*(.*)$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

// "Mon-Fri", "Tue,Thu", "weekdays", "daily" -> the weekday numbers it covers.
function weekdaysOf(when: string): number[] | undefined {
  const lower = when.toLowerCase()
  if (lower === 'daily' || lower === 'everyday') return [0, 1, 2, 3, 4, 5, 6]
  if (lower === 'weekdays') return [1, 2, 3, 4, 5]
  if (lower === 'weekends') return [0, 6]
  const days = new Set<number>()
  for (const part of lower.split(',')) {
    const [from, to] = part.split('-').map(name => WEEKDAYS.indexOf(name.slice(0, 3)))
    if (from === undefined || from < 0) return undefined
    if (to === undefined) days.add(from)
    else if (to < 0) return undefined
    else for (let d = from; ; d = (d + 1) % 7) {
      days.add(d)
      if (d === to) break
    }
  }

  return [...days]
}

// "2026-10-14" or "2026-12-21..2027-01-02" -> whether it covers the day.
function coversDate(when: string, iso: string): boolean | undefined {
  const [from, to = from] = when.split('..')
  if (from === undefined || !DATE.test(from) || !DATE.test(to)) return undefined

  return from <= iso && iso <= to
}

const cleanLabel = (text: string) => text.replace(/\s+#.*$/, '').trim() || 'break'

// The breaks that apply on one day, earliest first.
export function breaksOn(text: string, day: Day): BreakTime[] {
  const regular: (BreakTime & { isDaily: boolean })[] = []
  const dated: BreakTime[] = []
  let isOff = false

  for (const line of text.split('\n')) {
    const match = LINE.exec(line)
    if (match === null) continue
    const [, when = '', hh, mm, off, rest = ''] = match
    const label = cleanLabel(rest)
    const minute = off === undefined ? Number(hh) * 60 + Number(mm) : -1
    if (off === undefined && minute >= DAY_MINUTES) continue

    const onDate = coversDate(when, day.iso)
    if (onDate !== undefined) {
      if (!onDate) continue
      if (off !== undefined) isOff = true
      else dated.push({ minute, label })
      continue
    }
    const days = weekdaysOf(when)
    if (days === undefined || off !== undefined || !days.includes(day.weekday)) continue
    regular.push({ minute, label, isDaily: days.length === 7 })
  }

  const replaced = new Set(dated.map(one => one.label.toLowerCase()))
  const kept = regular
    .filter(one => (!isOff || one.isDaily) && !replaced.has(one.label.toLowerCase()))
    .map(({ minute, label }) => ({ minute, label }))

  return [...kept, ...dated].sort((a, b) => a.minute - b.minute)
}

// The local day for a timestamp, given minutes east of UTC.
export function dayAt(ms: number, offsetMinutes: number): Day {
  const d = new Date(ms + offsetMinutes * 60_000)
  const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

  return { iso, weekday: d.getUTCDay() }
}

// The break that ends the work day: the one labelled like "end of work", else none.
export function endOfWork(breaks: readonly BreakTime[]): BreakTime | undefined {
  return breaks.find(one => /\b(end of (work|day)|off work|stop work|done for the day)\b/i.test(one.label))
}
