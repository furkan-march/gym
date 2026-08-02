import { addDaysKey, weekStartKey, weekdayOf, weekdayOfKey } from '../dates'
import type {
  DateKey,
  ScheduledDay,
  Weekday,
  WorkoutSession,
  WorkoutTemplate,
} from '../types'

/**
 * Schedule engine (SPEC 5, 7). Pure functions over plain data; every function
 * takes an injected Date/DateKey — never the real clock.
 */

export interface PlanDescription {
  title: string
  /** null for non-strength days (their screens have no single start action) */
  primaryAction: string | null
}

export interface MissedWorkout {
  /** the scheduled local date that was missed */
  dateKey: DateKey
  templateId: string
}

/** Today-screen plan lookup via Date.getDay() (0 = Sunday, SPEC 5). */
export function getPlanForDate(date: Date, days: ScheduledDay[]): ScheduledDay {
  const weekday = weekdayOf(date)
  const day = days.find((d) => d.weekday === weekday)
  if (!day) {
    // The seed guarantees one row per weekday; a missing row is a data-integrity bug.
    throw new Error(`No scheduled day configured for weekday ${weekday}`)
  }
  return day
}

/**
 * Title and primary action for a scheduled day (SPEC 7, DAY-SPECIFIC BEHAVIOR).
 * Strength titles come from the live template name so renames flow through;
 * the Lower template keeps the spec wording "Start Legs Workout".
 */
export function describePlan(day: ScheduledDay, templates: WorkoutTemplate[]): PlanDescription {
  switch (day.planKind) {
    case 'strength': {
      const template =
        day.templateId == null ? undefined : templates.find((t) => t.id === day.templateId)
      if (!template) {
        // Strength day pointing at a deleted/unknown template: stay usable.
        return { title: 'Strength Workout', primaryAction: 'Start Workout' }
      }
      return {
        title: template.name,
        primaryAction: template.kind === 'lower' ? 'Start Legs Workout' : `Start ${template.name}`,
      }
    }
    case 'zone2':
      return { title: 'Zone 2 Cardio', primaryAction: null }
    case 'recovery':
      return { title: 'Recovery Day', primaryAction: null }
    case 'rest':
      return { title: 'Rest or Light Walk', primaryAction: null }
  }
}

/** First date strictly after `after` on which `templateId` is scheduled, or null. */
function nextScheduledOccurrence(
  after: DateKey,
  templateId: string,
  days: ScheduledDay[],
): DateKey | null {
  for (let ahead = 1; ahead <= 7; ahead++) {
    const key = addDaysKey(after, ahead)
    const day = days.find((d) => d.weekday === weekdayOfKey(key))
    if (day && day.planKind === 'strength' && day.templateId === templateId) return key
  }
  return null
}

/**
 * Missed-workout detection (SPEC 5, SESSION DATE AND MISSED WORKOUTS).
 * A scheduled strength workout is missed once local midnight has passed at the
 * end of its scheduled day (dateKey < today) with no completed session of that
 * template started that day. It persists until completed (that day or later),
 * dismissed, or the template's next scheduled occurrence arrives — so only the
 * trailing 7 days can hold a live miss. Days before programStart never count.
 * Returns the most recent live miss, or null.
 */
export function findMissedWorkout(
  today: DateKey,
  days: ScheduledDay[],
  sessions: WorkoutSession[],
  programStart: DateKey,
  dismissedKeys: DateKey[],
): MissedWorkout | null {
  for (let back = 1; back <= 7; back++) {
    const dateKey = addDaysKey(today, -back)
    if (dateKey < programStart) break
    const day = days.find((d) => d.weekday === weekdayOfKey(dateKey))
    if (!day || day.planKind !== 'strength' || day.templateId == null) continue
    const templateId = day.templateId
    if (dismissedKeys.includes(dateKey)) continue
    // A session's dateKey is its local start date, so "started that day and
    // completed" and "completed later instead" are both dateKey >= dateKey.
    const completed = sessions.some(
      (s) =>
        s.status === 'completed' &&
        s.templateId === templateId &&
        s.dateKey >= dateKey &&
        s.dateKey <= today,
    )
    if (completed) continue
    const next = nextScheduledOccurrence(dateKey, templateId, days)
    if (next != null && next <= today) continue
    return { dateKey, templateId }
  }
  return null
}

/** The 7 DateKeys of the week containing `anchor`, starting on `weekStartsOn`. */
export function weekDateKeys(anchor: DateKey, weekStartsOn: Weekday): DateKey[] {
  const start = weekStartKey(anchor, weekStartsOn)
  const keys: DateKey[] = []
  for (let i = 0; i < 7; i++) keys.push(addDaysKey(start, i))
  return keys
}
