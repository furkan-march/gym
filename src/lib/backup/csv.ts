import type {
  BodyMetric,
  CardioSession,
  DailyActivity,
  ExerciseSession,
  SetLog,
  WorkoutSession,
} from '../types'

/**
 * CSV exports (SPEC 30, V2 roadmap item 3). Pure serializers: the caller
 * passes plain arrays (already demo-filtered); only sets belonging to
 * COMPLETED sessions are exported (active and discarded sessions are not
 * history). RFC 4180: fields containing a comma, quote or line break are
 * quoted with quotes doubled; records are CRLF-terminated. All loads are
 * kilograms; dumbbell loads follow the loadConvention snapshotted on each set.
 */

const HEADER = [
  'date',
  'template',
  'exercise',
  'variant',
  'set',
  'warmup',
  'side',
  'loadKg',
  'loadConvention',
  'bodyweightMode',
  'addedWeightKg',
  'assistanceWeightKg',
  'reps',
  'rir',
  'completed',
] as const

function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return '"' + value.replaceAll('"', '""') + '"'
  }
  return value
}

function cell(value: string | number | boolean | null | undefined): string {
  if (value == null) return ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return csvField(String(value))
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function bySessionOrder(a: WorkoutSession, b: WorkoutSession): number {
  if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1
  if (a.startedAt !== b.startedAt) return a.startedAt < b.startedAt ? -1 : 1
  return compareIds(a.id, b.id)
}

function byOrderIndex(a: { orderIndex: number; id: string }, b: { orderIndex: number; id: string }): number {
  return a.orderIndex - b.orderIndex || compareIds(a.id, b.id)
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}

export function workoutHistoryCsv(
  sessions: WorkoutSession[],
  exerciseSessions: ExerciseSession[],
  sets: SetLog[],
): string {
  const exerciseSessionsBySession = groupBy(exerciseSessions, (es) => es.workoutSessionId)
  const setsByExerciseSession = groupBy(sets, (s) => s.exerciseSessionId)

  const lines: string[] = [HEADER.join(',')]
  const orderedSessions = sessions.filter((s) => s.status === 'completed').sort(bySessionOrder)

  for (const session of orderedSessions) {
    const esList = (exerciseSessionsBySession.get(session.id) ?? []).slice().sort(byOrderIndex)
    for (const es of esList) {
      const setList = (setsByExerciseSession.get(es.id) ?? []).slice().sort(byOrderIndex)
      setList.forEach((set, index) => {
        lines.push(
          [
            cell(session.dateKey),
            cell(session.templateName),
            cell(es.exerciseName),
            cell(es.variantName),
            cell(index + 1),
            cell(set.isWarmup),
            cell(set.side),
            cell(set.loadKg),
            cell(set.loadConvention),
            cell(set.bodyweightMode),
            cell(set.addedWeightKg),
            cell(set.assistanceWeightKg),
            cell(set.reps),
            cell(set.rir),
            cell(set.completed),
          ].join(','),
        )
      })
    }
  }

  return lines.join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------
// Body metrics CSV (V2 item 3)
// ---------------------------------------------------------------------------

const BODY_METRICS_HEADER = ['date', 'weightKg', 'waistCm', 'bodyFatPct'] as const

function byDateKeyOrder(a: { dateKey: string; id: string }, b: { dateKey: string; id: string }): number {
  if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1
  return compareIds(a.id, b.id)
}

/** One row per logged day; unmeasured fields stay empty. */
export function bodyMetricsCsv(metrics: BodyMetric[]): string {
  const lines: string[] = [BODY_METRICS_HEADER.join(',')]
  for (const m of metrics.slice().sort(byDateKeyOrder)) {
    lines.push([cell(m.dateKey), cell(m.weightKg), cell(m.waistCm), cell(m.bodyFatPct)].join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------
// Daily steps CSV (V2 item 3)
// ---------------------------------------------------------------------------

const DAILY_STEPS_HEADER = ['date', 'steps'] as const

/** One row per day with a logged step count; days without a count are skipped. */
export function dailyStepsCsv(activities: DailyActivity[]): string {
  const lines: string[] = [DAILY_STEPS_HEADER.join(',')]
  const rows = activities.filter((a) => a.steps != null).sort(byDateKeyOrder)
  for (const a of rows) {
    lines.push([cell(a.dateKey), cell(a.steps)].join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------
// Cardio sessions CSV (V2 item 3)
// ---------------------------------------------------------------------------

const CARDIO_HEADER = [
  'date',
  'type',
  'minutes',
  'distanceKm',
  'avgHeartRate',
  'perceivedIntensity',
  'zone2',
] as const

function byCardioOrder(a: CardioSession, b: CardioSession): number {
  if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return compareIds(a.id, b.id)
}

/** One row per cardio session, ordered by date then log time. */
export function cardioSessionsCsv(cardio: CardioSession[]): string {
  const lines: string[] = [CARDIO_HEADER.join(',')]
  for (const c of cardio.slice().sort(byCardioOrder)) {
    lines.push(
      [
        cell(c.dateKey),
        cell(c.type),
        cell(c.minutes),
        cell(c.distanceKm),
        cell(c.avgHeartRate),
        cell(c.perceivedIntensity),
        cell(c.isZone2),
      ].join(','),
    )
  }
  return lines.join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------
// Exercise history CSV (V2 item 3)
// ---------------------------------------------------------------------------

const EXERCISE_HISTORY_HEADER = [
  'date',
  'exercise',
  'variant',
  'equipmentContextId',
  'set',
  'side',
  'loadKg',
  'loadConvention',
  'bodyweightMode',
  'addedWeightKg',
  'assistanceWeightKg',
  'reps',
  'rir',
  'painFlag',
  'formQuality',
] as const

/**
 * One row per COMPLETED WORKING set (warm-ups and uncompleted sets excluded)
 * across all completed sessions, ordered by session date, then exercise order
 * within the session, then set order. The `set` column renumbers the working
 * sets 1..n within each exercise session.
 */
export function exerciseHistoryCsv(
  exerciseSessions: ExerciseSession[],
  sets: SetLog[],
  sessions: WorkoutSession[],
): string {
  const exerciseSessionsBySession = groupBy(exerciseSessions, (es) => es.workoutSessionId)
  const setsByExerciseSession = groupBy(sets, (s) => s.exerciseSessionId)

  const lines: string[] = [EXERCISE_HISTORY_HEADER.join(',')]
  const orderedSessions = sessions.filter((s) => s.status === 'completed').sort(bySessionOrder)

  for (const session of orderedSessions) {
    const esList = (exerciseSessionsBySession.get(session.id) ?? []).slice().sort(byOrderIndex)
    for (const es of esList) {
      const workingSets = (setsByExerciseSession.get(es.id) ?? [])
        .filter((s) => s.completed && !s.isWarmup)
        .sort(byOrderIndex)
      workingSets.forEach((set, index) => {
        lines.push(
          [
            cell(session.dateKey),
            cell(es.exerciseName),
            cell(es.variantName),
            cell(set.equipmentContextId),
            cell(index + 1),
            cell(set.side),
            cell(set.loadKg),
            cell(set.loadConvention),
            cell(set.bodyweightMode),
            cell(set.addedWeightKg),
            cell(set.assistanceWeightKg),
            cell(set.reps),
            cell(set.rir),
            cell(set.painFlag),
            cell(set.formQuality),
          ].join(','),
        )
      })
    }
  }

  return lines.join('\r\n') + '\r\n'
}
