import { weekdayOfKey } from '../dates'
import { weekDateKeys } from './schedule'
import type {
  CardioSession,
  DateKey,
  ReadinessLog,
  ScheduledDay,
  Weekday,
} from '../types'

/**
 * Second Zone 2 suggestion (SPEC 39, V2 item 6). Pure function over plain
 * arrays; the caller filters demo rows and computes the fatigue-notice flag.
 *
 * Deliberately conservative: it only ever proposes an OPTIONAL extra easy
 * session, and only when every recovery-related gate holds. It never nags —
 * a false result carries no message at all.
 */

export interface SecondZone2Input {
  todayKey: DateKey
  weekStartsOn: Weekday
  scheduledDays: ScheduledDay[]
  cardio: CardioSession[]
  readiness: ReadinessLog[]
  /** true when any main lift currently shows a fatigue notice or deload suggestion */
  hasActiveFatigueNotice: boolean
  /** AppSettings.weeklyZone2Target — sessions per week */
  weeklyZone2Target: number
}

export interface SecondZone2Result {
  suggest: boolean
  /** one neutral sentence when suggesting; empty string otherwise */
  reason: string
}

export const SECOND_ZONE2_REASON =
  "Recovery looks fine and this week's Zone 2 is done — an optional second easy session fits today."

const NO_SUGGESTION: SecondZone2Result = { suggest: false, reason: '' }

/**
 * Suggest an optional second Zone 2 session ONLY when ALL of these hold:
 * 1. today is a rest or recovery day;
 * 2. every scheduled Zone 2 day (planKind 'zone2') this week already has an
 *    isZone2 cardio session logged on its date — and at least one such day
 *    exists in the schedule;
 * 3. no main lift has an active fatigue/deload notice;
 * 4. the average energy of the last 3 saved readiness logs is >= 3, or no
 *    readiness logs exist at all;
 * 5. fewer than (weeklyZone2Target + 1) Zone 2 sessions are logged this week.
 */
export function suggestSecondZone2(input: SecondZone2Input): SecondZone2Result {
  // 1. Today must be a rest or recovery day.
  const today = input.scheduledDays.find((d) => d.weekday === weekdayOfKey(input.todayKey))
  if (!today || (today.planKind !== 'rest' && today.planKind !== 'recovery')) return NO_SUGGESTION

  // 3. Never suggest extra work while anything looks fatigued or stalled.
  if (input.hasActiveFatigueNotice) return NO_SUGGESTION

  const weekKeys = weekDateKeys(input.todayKey, input.weekStartsOn)
  const weekZone2 = input.cardio.filter((c) => c.isZone2 && weekKeys.includes(c.dateKey))

  // 2. The week's scheduled Zone 2 must already be done.
  const zone2Days = input.scheduledDays.filter((d) => d.planKind === 'zone2')
  if (zone2Days.length === 0) return NO_SUGGESTION
  const scheduledDone = zone2Days.every((d) =>
    weekZone2.some((c) => weekdayOfKey(c.dateKey) === d.weekday),
  )
  if (!scheduledDone) return NO_SUGGESTION

  // 4. Recent readiness energy must not trend low (no logs at all is fine).
  const recent = [...input.readiness]
    .sort(
      (a, b) => b.dateKey.localeCompare(a.dateKey) || b.createdAt.localeCompare(a.createdAt),
    )
    .slice(0, 3)
  if (recent.length > 0) {
    const avgEnergy = recent.reduce((sum, r) => sum + r.energy, 0) / recent.length
    if (avgEnergy < 3) return NO_SUGGESTION
  }

  // 5. Cap the week at one optional session beyond the target.
  if (weekZone2.length >= input.weeklyZone2Target + 1) return NO_SUGGESTION

  return { suggest: true, reason: SECOND_ZONE2_REASON }
}
