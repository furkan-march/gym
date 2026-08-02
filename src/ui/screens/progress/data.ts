import { trailingWindow, weekdayOfKey } from '../../../lib/dates'
import { EX } from '../../../lib/seed/seed'
import { isSessionCompleted } from '../../../lib/engines/adherence'
import { bestSessionE1rm } from '../../../lib/engines/e1rm'
import { detectStall, type ComparableSessionInput } from '../../../lib/engines/progression'
import type {
  BodyMetric,
  CardioSession,
  DailyActivity,
  DateKey,
  Exercise,
  ExerciseSession,
  ExerciseVariant,
  NutritionAdherenceLog,
  PostureRoutineLog,
  ScheduledDay,
  SetLog,
  WorkoutSession,
} from '../../../lib/types'

/**
 * Progress-screen data builders (SPEC 19/21/24). Pure functions over plain
 * arrays; demo rows are excluded by the caller via filterDemo (SPEC 34 — no
 * isDemo index exists, so filtering is always plain JS).
 */

export function filterDemo<T extends { isDemo?: boolean }>(rows: T[], includeDemo: boolean): T[] {
  return includeDemo ? rows : rows.filter((r) => r.isDemo !== true)
}

/** The main lifts offered as e1RM chips and scanned for progression status. */
export const MAIN_LIFTS: { id: string; label: string }[] = [
  { id: EX.benchPress, label: 'Bench' },
  { id: EX.squat, label: 'Squat' },
  { id: EX.romanianDeadlift, label: 'RDL' },
  { id: EX.overheadPress, label: 'OHP' },
  { id: EX.pullUp, label: 'Pull-Up' },
]

// ---------------------------------------------------------------------------
// Estimated 1RM series (SPEC 20)
// ---------------------------------------------------------------------------

export interface E1rmPoint {
  dateKey: DateKey
  e1rm: number
}

/**
 * Best valid session e1RM per exercise per completed session, chronological.
 * bestSessionE1rm applies the SPEC 20 gates (completed working sets, <= 12
 * reps, meaningful load — bodyweight moves need the session's bodyweight
 * snapshot for an effective load, otherwise the session yields no point).
 */
export function buildE1rmSeries(
  sessions: WorkoutSession[],
  exerciseSessions: ExerciseSession[],
  sets: SetLog[],
): Map<string, E1rmPoint[]> {
  const sessionById = new Map<string, WorkoutSession>()
  for (const s of sessions) if (s.status === 'completed') sessionById.set(s.id, s)

  const setsByEs = new Map<string, SetLog[]>()
  for (const s of sets) {
    const list = setsByEs.get(s.exerciseSessionId)
    if (list) list.push(s)
    else setsByEs.set(s.exerciseSessionId, [s])
  }

  // One point per (exercise, session): the best across its exercise sessions.
  const best = new Map<string, { exerciseId: string; session: WorkoutSession; e1rm: number }>()
  for (const es of exerciseSessions) {
    const session = sessionById.get(es.workoutSessionId)
    if (!session) continue
    const v = bestSessionE1rm(setsByEs.get(es.id) ?? [], session.bodyweightAtSessionKg)
    if (v == null) continue
    const key = `${es.exerciseId}|${session.id}`
    const cur = best.get(key)
    if (!cur || v > cur.e1rm) best.set(key, { exerciseId: es.exerciseId, session, e1rm: v })
  }

  const ordered = [...best.values()].sort((a, b) =>
    a.session.dateKey === b.session.dateKey
      ? a.session.startedAt.localeCompare(b.session.startedAt)
      : a.session.dateKey.localeCompare(b.session.dateKey),
  )

  const out = new Map<string, E1rmPoint[]>()
  for (const e of ordered) {
    const point: E1rmPoint = {
      dateKey: e.session.dateKey,
      e1rm: Math.round(e.e1rm * 10) / 10,
    }
    const list = out.get(e.exerciseId)
    if (list) list.push(point)
    else out.set(e.exerciseId, [point])
  }
  return out
}

// ---------------------------------------------------------------------------
// Progression status / fatigue notices (SPEC 14/19)
// ---------------------------------------------------------------------------

export interface StallNotice {
  exerciseId: string
  exerciseName: string
  variantId: string | null
  variantName: string | null
  kind: 'fatigueNotice' | 'deloadSuggestion'
  explanation: string
}

/**
 * detectStall over each main lift's comparable history. Histories are grouped
 * by strict variantId equality (null is its own group, matching the engine's
 * comparability rule) and need at least 2 sessions to say anything.
 */
export function buildStallNotices(input: {
  exercises: Exercise[]
  variants: ExerciseVariant[]
  sessions: WorkoutSession[]
  exerciseSessions: ExerciseSession[]
  sets: SetLog[]
}): StallNotice[] {
  const sessionById = new Map<string, WorkoutSession>()
  for (const s of input.sessions) if (s.status === 'completed') sessionById.set(s.id, s)

  const setsByEs = new Map<string, SetLog[]>()
  for (const s of input.sets) {
    const list = setsByEs.get(s.exerciseSessionId)
    if (list) list.push(s)
    else setsByEs.set(s.exerciseSessionId, [s])
  }

  const notices: StallNotice[] = []
  for (const lift of MAIN_LIFTS) {
    const exercise = input.exercises.find((e) => e.id === lift.id)
    if (!exercise) continue

    const groups = new Map<string, { variantId: string | null; entries: ComparableSessionInput[] }>()
    for (const es of input.exerciseSessions) {
      if (es.exerciseId !== lift.id) continue
      const session = sessionById.get(es.workoutSessionId)
      if (!session) continue
      const key = `v|${es.variantId ?? ''}`
      let group = groups.get(key)
      if (!group) {
        group = { variantId: es.variantId, entries: [] }
        groups.set(key, group)
      }
      group.entries.push({
        session,
        exerciseSession: es,
        sets: setsByEs.get(es.id) ?? [],
        feedback: null,
      })
    }

    for (const group of groups.values()) {
      if (group.entries.length < 2) continue
      // Newest first, as detectStall expects.
      group.entries.sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt))
      const result = detectStall(group.entries)
      if (result.kind === 'none') continue
      const variantName =
        group.variantId == null
          ? null
          : (input.variants.find((v) => v.id === group.variantId)?.name ?? null)
      notices.push({
        exerciseId: lift.id,
        exerciseName: exercise.name,
        variantId: group.variantId,
        variantName,
        kind: result.kind,
        explanation: result.explanation,
      })
    }
  }
  return notices
}

// ---------------------------------------------------------------------------
// 14-day adherence gate for the adjustment logic (SPEC 24 DEFINITIONS)
// ---------------------------------------------------------------------------

/** Steps threshold used by the adjustment gate (SPEC 24: "at or above 8,000"). */
export const STEP_ADHERENCE_MIN = 8000

export interface Adherence14 {
  /** mean of the three 14-day ratios in percent units; null when nothing tracked */
  pct: number | null
  /** days in the prior 14 with any tracking at all */
  trackedDays: number
}

/**
 * Adherence for the adjustment gate = mean of three ratios over the prior 14
 * days: strength completed ÷ scheduled; calorie days Under/On target ÷ days
 * tracked; step days >= 8,000 ÷ days logged. Ratios without a denominator are
 * skipped; each is clamped to 1 so extra sessions never inflate the mean.
 */
export function adherence14(input: {
  todayKey: DateKey
  programStart: DateKey
  days: ScheduledDay[]
  sessions: WorkoutSession[]
  exerciseSessions: ExerciseSession[]
  sets: SetLog[]
  nutritionLogs: NutritionAdherenceLog[]
  activities: DailyActivity[]
  metrics: BodyMetric[]
  cardio: CardioSession[]
  postureLogs: PostureRoutineLog[]
}): Adherence14 {
  const windowKeys = trailingWindow(input.todayKey, 14)
  const first = windowKeys[0] ?? input.todayKey
  const inWindow = (k: DateKey): boolean => k >= first && k <= input.todayKey

  let scheduled = 0
  for (const key of windowKeys) {
    if (key < input.programStart) continue
    const day = input.days.find((d) => d.weekday === weekdayOfKey(key))
    if (day && day.planKind === 'strength') scheduled++
  }
  let completed = 0
  for (const s of input.sessions) {
    if (!inWindow(s.dateKey)) continue
    if (isSessionCompleted(s, input.exerciseSessions, input.sets)) completed++
  }

  let calTracked = 0
  let calOk = 0
  for (const n of input.nutritionLogs) {
    if (!inWindow(n.dateKey) || n.calories === 'notTracked') continue
    calTracked++
    if (n.calories === 'under' || n.calories === 'onTarget') calOk++
  }

  let stepDays = 0
  let stepOk = 0
  for (const a of input.activities) {
    if (!inWindow(a.dateKey) || a.steps == null) continue
    stepDays++
    if (a.steps >= STEP_ADHERENCE_MIN) stepOk++
  }

  const ratios: number[] = []
  if (scheduled > 0) ratios.push(Math.min(1, completed / scheduled))
  if (calTracked > 0) ratios.push(calOk / calTracked)
  if (stepDays > 0) ratios.push(stepOk / stepDays)
  const pct =
    ratios.length > 0 ? (ratios.reduce((acc, r) => acc + r, 0) / ratios.length) * 100 : null

  const tracked = new Set<DateKey>()
  const mark = (k: DateKey) => {
    if (inWindow(k)) tracked.add(k)
  }
  for (const m of input.metrics) mark(m.dateKey)
  for (const a of input.activities) if (a.steps != null) mark(a.dateKey)
  for (const n of input.nutritionLogs) mark(n.dateKey)
  for (const c of input.cardio) mark(c.dateKey)
  for (const p of input.postureLogs) mark(p.dateKey)
  for (const s of input.sessions) mark(s.dateKey)

  return { pct, trackedDays: tracked.size }
}
