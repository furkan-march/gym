import type { PlanKind, Weekday } from '../../../lib/types'

/** Monday-first weekday order (SPEC 5: week starts Monday). */
export const WEEKDAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0]

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
}

export const WEEKDAY_FULL: Record<Weekday, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
}

export const PLAN_KIND_LABELS: Record<PlanKind, string> = {
  strength: 'Strength',
  zone2: 'Zone 2',
  recovery: 'Recovery',
  rest: 'Rest',
}

/** Sort helper so stored weekday arrays stay Monday-first. */
export function monFirst(d: Weekday): number {
  return (d + 6) % 7
}

export const inputCls =
  'min-h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-[15px] outline-none focus:border-accent'

export function Loading() {
  return <div className="py-10 text-center text-[14px] text-text-muted">Loading…</div>
}

/** SPEC 5/27: sessions snapshot their prescription, so plan edits are history-safe. */
export function PlanFootnote() {
  return (
    <p className="mt-4 px-1 text-[12px] text-text-muted">
      Plan changes never alter past sessions — history keeps its own snapshot.
    </p>
  )
}
