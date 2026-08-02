import { weekdayOfKey } from '../dates'
import type {
  DateKey,
  ExerciseSession,
  ScheduledDay,
  SetLog,
  Weekday,
  WorkoutSession,
} from '../types'
import { weekDateKeys } from './schedule'

/**
 * Strength-adherence engine (SPEC 24, DEFINITIONS). Pure functions over plain
 * data; 'today' is always injected, never read from the clock.
 */

export interface WeeklyStrengthAdherence {
  completed: number
  scheduled: number
  /** completed / scheduled; null when nothing was scheduled */
  pct: number | null
}

/**
 * Does this exercise session's prescription count toward the session's
 * prescribed working sets? Substituted originals do not (the replacement fills
 * the planned slot via its own prescription snapshot), unplanned extras were
 * never prescribed, and optional exercises never penalize (SPEC 18). Skipped
 * exercises DO stay in the denominator — skipping prescribed work is exactly
 * what the 50% completion rule measures.
 */
function countsTowardPrescription(es: ExerciseSession): boolean {
  if (es.status === 'substituted') return false
  if (es.isUnplanned && es.substitutedFromExerciseSessionId == null) return false
  if (es.prescription.isOptional) return false
  return true
}

/**
 * SPEC 24: a strength session counts as completed when the user tapped Finish
 * (status 'completed') AND at least 50% of prescribed working sets are marked
 * completed. `prescription.prescribedSets` is per side, so unilateral
 * prescriptions count x2; each logged per-side SetLog row is one set.
 * ExerciseSession does not carry the exercise's `unilateral` flag, so per-side
 * work is detected from logged sets carrying a non-null `side`.
 */
export function isSessionCompleted(
  session: WorkoutSession,
  exerciseSessions: ExerciseSession[],
  sets: SetLog[],
): boolean {
  if (session.status !== 'completed') return false

  const ownExercises = exerciseSessions.filter((es) => es.workoutSessionId === session.id)
  const ownSets = sets.filter((s) => s.workoutSessionId === session.id)
  const counted = ownExercises.filter(countsTowardPrescription)

  let prescribed = 0
  for (const es of counted) {
    const unilateral = ownSets.some((s) => s.exerciseSessionId === es.id && s.side != null)
    prescribed += es.prescription.prescribedSets * (unilateral ? 2 : 1)
  }

  if (prescribed === 0) {
    // Fully unplanned (or fully substituted-away) session: any real completed
    // working set on a non-substituted exercise makes it count.
    return ownSets.some(
      (s) =>
        s.completed &&
        !s.isWarmup &&
        ownExercises.some((es) => es.id === s.exerciseSessionId && es.status !== 'substituted'),
    )
  }

  const countedIds = new Set(counted.map((es) => es.id))
  const completedWorking = ownSets.filter(
    (s) => s.completed && !s.isWarmup && countedIds.has(s.exerciseSessionId),
  ).length
  return completedWorking >= prescribed / 2
}

/**
 * Weekly strength adherence (SPEC 24): completed strength sessions divided by
 * scheduled strength sessions in the week containing `weekAnchor`, counting
 * only scheduled dates on or after programStart and not after `today` — the
 * partial first week is prorated this way. The numerator counts every
 * completed session dated inside the week, including workouts done on
 * non-scheduled days (completing a missed workout late still counts).
 */
export function weeklyStrengthAdherence(
  weekAnchor: DateKey,
  today: DateKey,
  programStart: DateKey,
  days: ScheduledDay[],
  sessions: WorkoutSession[],
  exerciseSessions: ExerciseSession[],
  sets: SetLog[],
  weekStartsOn: Weekday = 1,
): WeeklyStrengthAdherence {
  const weekKeys = weekDateKeys(weekAnchor, weekStartsOn)

  let scheduled = 0
  for (const key of weekKeys) {
    if (key < programStart || key > today) continue
    const day = days.find((d) => d.weekday === weekdayOfKey(key))
    if (day && day.planKind === 'strength') scheduled++
  }

  const weekSet = new Set(weekKeys)
  const completed = sessions.filter(
    (s) => weekSet.has(s.dateKey) && isSessionCompleted(s, exerciseSessions, sets),
  ).length

  return { completed, scheduled, pct: scheduled === 0 ? null : completed / scheduled }
}
