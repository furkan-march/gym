import type { ExerciseSession, SetLog, WorkoutSession } from '../types'

/**
 * Workout-history CSV export (SPEC 30). Pure serializer: the caller passes
 * plain arrays; only sets belonging to COMPLETED sessions are exported
 * (active and discarded sessions are not history). RFC 4180: fields containing
 * a comma, quote or line break are quoted with quotes doubled; records are
 * CRLF-terminated. All loads are kilograms; dumbbell loads follow the
 * loadConvention snapshotted on each set.
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
