import type {
  BodyMetric,
  CardioSession,
  DailyActivity,
  DateKey,
  ExerciseSession,
  NutritionAdherenceLog,
  PostureRoutineLog,
  PostureRoutineTemplate,
  ScheduledDay,
  SetLog,
  Timestamp,
  WeeklyCheckIn,
  WorkoutSession,
} from '../types'
import { addDaysKey, dateKeyRange, weekdayOfKey } from '../dates'
import { isExcessiveLoss, isPlateau, sevenDayAvg, waistTrend, weeklyChangePct } from './bodyMetrics'

/**
 * Weekly check-in engine (SPEC 24). Pure: all inputs, including today's date and
 * the clock, are parameters. Percentages are in percent units (66.7 = 66.7%).
 */

/** Adjustment gate (SPEC 24 DEFINITIONS): adherence >= 80% over the prior 14 days ... */
export const ADJUSTMENT_MIN_ADHERENCE_PCT = 80
/** ... and at least 10 of 14 days with any tracking. */
export const ADJUSTMENT_MIN_TRACKED_DAYS = 10

/** A strength session counts as completed when >= 50% of prescribed working sets are done. */
export const SESSION_COMPLETION_MIN_RATIO = 0.5

export interface WeeklyCheckInData {
  metrics: BodyMetric[]
  sessions: WorkoutSession[]
  exerciseSessions: ExerciseSession[]
  sets: SetLog[]
  days: ScheduledDay[]
  activities: DailyActivity[]
  cardio: CardioSession[]
  postureLogs: PostureRoutineLog[]
  postureTemplate: PostureRoutineTemplate | null
  nutritionLogs: NutritionAdherenceLog[]
  /** program start; scheduled days before it never count (partial first week is prorated) */
  programStart: DateKey
  /** local today; scheduled days after it never count ("not in the future", SPEC 24) */
  todayKey: DateKey
  /** injected clock for createdAt/updatedAt so the builder stays pure */
  now: Timestamp
}

function pct(numerator: number, denominator: number): number {
  return (numerator / denominator) * 100
}

// Canonical completion rule lives in adherence.ts; re-exported here so the
// check-in module keeps a single import surface.
import { isSessionCompleted } from './adherence'
export { isSessionCompleted }

/**
 * Builds the computed part of the weekly check-in for the Monday-Sunday week
 * starting at weekStartKey. The five user-entered 1-5 ratings (hunger, energy,
 * gym performance, sleep, stress) stay null until the user fills them in.
 * The id is deterministic per week so rebuilding is idempotent.
 */
export function buildWeeklyCheckIn(weekStartKey: DateKey, data: WeeklyCheckInData): WeeklyCheckIn {
  const weekEndKey = addDaysKey(weekStartKey, 6)
  const weekKeys = dateKeyRange(weekStartKey, weekEndKey)
  const inWeek = (dateKey: DateKey): boolean =>
    dateKey >= weekStartKey && dateKey <= weekEndKey

  // Weight: current vs previous 7-day averages, both anchored to the week's Sunday.
  const currentAvg = sevenDayAvg(data.metrics, weekEndKey).avg
  const previousAvg = sevenDayAvg(data.metrics, addDaysKey(weekEndKey, -7)).avg
  const changePct = weeklyChangePct(data.metrics, weekEndKey)

  // Waist: most recent waist entry inside the covered week.
  let waistCm: number | null = null
  let waistDate: DateKey | null = null
  for (const m of data.metrics) {
    if (m.waistCm != null && inWeek(m.dateKey) && (waistDate == null || m.dateKey > waistDate)) {
      waistCm = m.waistCm
      waistDate = m.dateKey
    }
  }

  // Scheduled strength sessions: days in the week that are strength days, on or
  // after program start, and not in the future (prorates the partial first week).
  let scheduled = 0
  for (const key of weekKeys) {
    if (key < data.programStart || key > data.todayKey) continue
    const weekday = weekdayOfKey(key)
    if (data.days.some((d) => d.weekday === weekday && d.planKind === 'strength')) scheduled++
  }

  let completed = 0
  for (const session of data.sessions) {
    if (!inWeek(session.dateKey)) continue
    if (isSessionCompleted(session, data.exerciseSessions, data.sets)) completed++
  }

  // Average steps: mean over days that have a step entry (SPEC 25).
  let stepSum = 0
  let stepDays = 0
  for (const a of data.activities) {
    if (a.steps != null && inWeek(a.dateKey)) {
      stepSum += a.steps
      stepDays++
    }
  }
  const avgSteps = stepDays > 0 ? Math.round(stepSum / stepDays) : null

  let cardioMinutes = 0
  for (const c of data.cardio) {
    if (inWeek(c.dateKey)) cardioMinutes += c.minutes
  }

  // Posture: required scheduled days completed / required scheduled days (SPEC 10),
  // clamped to the program window the same way strength days are.
  let postureAdherencePct: number | null = null
  if (data.postureTemplate != null) {
    let required = 0
    let done = 0
    for (const key of weekKeys) {
      if (key < data.programStart || key > data.todayKey) continue
      if (!data.postureTemplate.requiredDays.includes(weekdayOfKey(key))) continue
      required++
      const log = data.postureLogs.find((l) => l.dateKey === key)
      if (log != null && log.totalItems > 0 && log.completedItemIds.length >= log.totalItems) {
        done++
      }
    }
    if (required > 0) postureAdherencePct = pct(done, required)
  }

  // Nutrition: adherent days / tracked days. Calories count Under or Approximately
  // on target as adherent (SPEC 24 DEFINITIONS); protein mirrors that with
  // Reached or Nearly reached.
  let calTracked = 0
  let calAdherent = 0
  let proTracked = 0
  let proAdherent = 0
  for (const n of data.nutritionLogs) {
    if (!inWeek(n.dateKey)) continue
    if (n.calories !== 'notTracked') {
      calTracked++
      if (n.calories === 'under' || n.calories === 'onTarget') calAdherent++
    }
    if (n.protein !== 'notTracked') {
      proTracked++
      if (n.protein === 'reached' || n.protein === 'nearly') proAdherent++
    }
  }

  return {
    id: `checkin-${weekStartKey}`,
    weekStartDateKey: weekStartKey,
    currentAvgWeightKg: currentAvg,
    previousAvgWeightKg: previousAvg,
    weightChangePct: changePct,
    waistCm,
    strengthSessionsCompleted: completed,
    strengthSessionsScheduled: scheduled,
    avgSteps,
    cardioMinutes,
    postureAdherencePct,
    calorieAdherencePct: calTracked > 0 ? pct(calAdherent, calTracked) : null,
    proteinAdherencePct: proTracked > 0 ? pct(proAdherent, proTracked) : null,
    hunger: null,
    energy: null,
    gymPerformance: null,
    sleep: null,
    stress: null,
    createdAt: data.now,
    updatedAt: data.now,
  }
}

export type AdjustmentKind =
  | 'none'
  | 'plateauAdjust'
  | 'excessiveLoss'
  | 'reviewRecovery'
  | 'holdSteady'

export interface AdjustmentSuggestion {
  kind: AdjustmentKind
  /** plain-sentence reasoning; suggestions are never applied automatically */
  explanation: string
  options: string[]
}

export interface AdjustmentInput {
  metrics: BodyMetric[]
  todayKey: DateKey
  /** mean of the three 14-day adherence ratios (SPEC 24 DEFINITIONS), 0-100; null = unknown */
  adherencePct: number | null
  /** days in the prior 14 with any tracking */
  trackedDays14: number
  /** true when multiple compound lifts are declining (progression engine's verdict) */
  strengthDeclining: boolean
  waist: ReturnType<typeof waistTrend>
}

/**
 * SPEC 24 ADJUSTMENT LOGIC. Priority: excessive loss (safety) beats everything;
 * declining strength routes to recovery review before any eat-less suggestion;
 * a flat scale with a shrinking waist and stable strength is reframed as normal
 * recomposition; only then is a plateau adjustment offered, and only behind the
 * adherence gate. Suggestions are text only — user data is never modified.
 */
export function adjustmentSuggestion(input: AdjustmentInput): AdjustmentSuggestion {
  const { metrics, todayKey } = input

  if (isExcessiveLoss(metrics, todayKey)) {
    return {
      kind: 'excessiveLoss',
      explanation:
        'Based on 7-day averages you are losing more than 0.8% of body weight per week. ' +
        'Losing this fast makes it harder to keep muscle and gym performance, so a modest ' +
        'calorie increase is worth considering. Nothing changes unless you edit the target yourself.',
      options: ['Increase the daily calorie target modestly, by about 100-150 kcal'],
    }
  }

  if (input.strengthDeclining) {
    return {
      kind: 'reviewRecovery',
      explanation:
        'Several compound lifts are trending down. That is usually a recovery signal, not a ' +
        'reason to eat less, so review the areas below before changing any nutrition target.',
      options: [
        'Review sleep quality and duration',
        'Review overall recovery and stress',
        'Review training fatigue',
        'Review your rate of weight loss',
        'Review adherence over the last two weeks',
        'Review joint discomfort',
      ],
    }
  }

  const plateau = isPlateau(metrics, todayKey)

  if (plateau && input.waist === 'decreasing') {
    return {
      kind: 'holdSteady',
      explanation:
        'Strength is stable and your waist is trending down while scale weight is temporarily ' +
        'flat. That pattern usually means body composition is still improving, so no immediate ' +
        'change is necessary.',
      options: [],
    }
  }

  if (plateau) {
    const gatePasses =
      input.adherencePct != null &&
      input.adherencePct >= ADJUSTMENT_MIN_ADHERENCE_PCT &&
      input.trackedDays14 >= ADJUSTMENT_MIN_TRACKED_DAYS
    if (gatePasses) {
      return {
        kind: 'plateauAdjust',
        explanation:
          'Your 7-day average weight has not decreased over the last 14 days, and your ' +
          'adherence in that period was high, so a small adjustment is reasonable. Pick at ' +
          'most one option — the app never changes your targets automatically.',
        options: [
          'Reduce the daily calorie target by 100-150 kcal',
          'Increase average daily steps by about 1,500-2,000',
        ],
      }
    }
    return {
      kind: 'none',
      explanation:
        'Your 7-day average weight has been flat for 14 days, but tracking or adherence over ' +
        'the last two weeks is too low to justify changing targets. Focus on consistent ' +
        'logging and hitting the current targets first.',
      options: [],
    }
  }

  return {
    kind: 'none',
    explanation: 'Weight trend looks on track; no adjustment is suggested right now.',
    options: [],
  }
}
