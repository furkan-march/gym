import { addDays, format, parse, startOfWeek } from 'date-fns'
import type { DateKey, Weekday } from './types'

/** Local calendar date key. All per-day records group by this, never by UTC. */
export function toDateKey(date: Date): DateKey {
  return format(date, 'yyyy-MM-dd')
}

/** Parse a DateKey back to a local-midnight Date. */
export function fromDateKey(key: DateKey): Date {
  return parse(key, 'yyyy-MM-dd', new Date())
}

export function weekdayOf(date: Date): Weekday {
  return date.getDay() as Weekday
}

export function weekdayOfKey(key: DateKey): Weekday {
  return weekdayOf(fromDateKey(key))
}

/** Monday-start week begin for the week containing `date` (weekStartsOn default 1). */
export function weekStart(date: Date, weekStartsOn: Weekday = 1): Date {
  return startOfWeek(date, { weekStartsOn })
}

export function weekStartKey(key: DateKey, weekStartsOn: Weekday = 1): DateKey {
  return toDateKey(weekStart(fromDateKey(key), weekStartsOn))
}

export function addDaysKey(key: DateKey, days: number): DateKey {
  return toDateKey(addDays(fromDateKey(key), days))
}

/** Inclusive list of DateKeys from `from` to `to`. */
export function dateKeyRange(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = []
  let cur = from
  while (cur <= to) {
    out.push(cur)
    cur = addDaysKey(cur, 1)
  }
  return out
}

/** DateKeys of the trailing `days` window ending at `end` (inclusive). */
export function trailingWindow(end: DateKey, days: number): DateKey[] {
  return dateKeyRange(addDaysKey(end, -(days - 1)), end)
}

export function formatShort(key: DateKey): string {
  return format(fromDateKey(key), 'd MMM')
}
