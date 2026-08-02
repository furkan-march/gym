import type { ExerciseSession, SetLog, WorkoutSession } from '../types'
import { workoutHistoryCsv } from './csv'

const T = '2026-08-04T10:00:00.000Z'

function makeSession(id: string, overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id,
    templateId: 'tpl-upper-a',
    templateName: 'Upper A',
    templateKind: 'upperA',
    dateKey: '2026-08-04',
    startedAt: '2026-08-04T09:00:00.000Z',
    finishedAt: T,
    status: 'completed',
    bodyweightAtSessionKg: 90,
    activeSeconds: 3200,
    lastActivatedAt: null,
    createdAt: T,
    updatedAt: T,
    ...overrides,
  }
}

function makeExerciseSession(
  id: string,
  workoutSessionId: string,
  exerciseName: string,
  overrides: Partial<ExerciseSession> = {},
): ExerciseSession {
  return {
    id,
    workoutSessionId,
    exerciseId: 'ex-' + id,
    variantId: null,
    equipmentContextId: null,
    exerciseName,
    variantName: null,
    status: 'completed',
    orderIndex: 0,
    isUnplanned: false,
    substitutedByExerciseSessionId: null,
    substitutedFromExerciseSessionId: null,
    prescription: {
      prescribedSets: 3,
      repRangeMin: 6,
      repRangeMax: 10,
      targetRIRMin: 1,
      targetRIRMax: 2,
      restSeconds: 150,
      incrementKg: 2.5,
      isOptional: false,
      supersetGroup: null,
    },
    createdAt: T,
    updatedAt: T,
    ...overrides,
  }
}

function makeSet(
  id: string,
  exerciseSessionId: string,
  workoutSessionId: string,
  overrides: Partial<SetLog> = {},
): SetLog {
  return {
    id,
    workoutSessionId,
    exerciseSessionId,
    exerciseId: 'ex-generic',
    variantId: null,
    equipmentContextId: null,
    loadKg: 60,
    reps: 8,
    rir: 2,
    completed: true,
    isWarmup: false,
    side: null,
    bodyweightMode: 'none',
    addedWeightKg: null,
    assistanceWeightKg: null,
    loadConvention: null,
    orderIndex: 0,
    completedAt: T,
    formQuality: null,
    painFlag: false,
    createdAt: T,
    updatedAt: T,
    ...overrides,
  }
}

const HEADER =
  'date,template,exercise,variant,set,warmup,side,loadKg,loadConvention,bodyweightMode,addedWeightKg,assistanceWeightKg,reps,rir,completed'

describe('workoutHistoryCsv', () => {
  it('serializes a small history fixture exactly (ordering, nulls, RFC 4180 quoting)', () => {
    const lower = makeSession('ws-lower', {
      dateKey: '2026-08-02',
      templateName: 'Lower / Legs',
      templateKind: 'lower',
      startedAt: '2026-08-02T09:00:00.000Z',
    })
    const upper = makeSession('ws-upper')
    const discarded = makeSession('ws-discarded', {
      dateKey: '2026-08-03',
      templateName: 'Abandoned',
      status: 'discarded',
    })

    const esBss = makeExerciseSession('es-bss', 'ws-lower', 'Bulgarian Split Squat')
    const esBench = makeExerciseSession('es-bench', 'ws-upper', 'Bench Press', { orderIndex: 0 })
    const esIncline = makeExerciseSession('es-incline', 'ws-upper', 'Incline Dumbbell Press', {
      orderIndex: 1,
      variantName: 'Wide, "comfort" grip',
    })
    const esPullup = makeExerciseSession('es-pullup', 'ws-upper', 'Pull-Up', { orderIndex: 2 })
    const esGhost = makeExerciseSession('es-ghost', 'ws-discarded', 'Ghost Press')

    const sets = [
      // deliberately shuffled: serializer must order by session date, exercise order, set order
      makeSet('st-pullup-1', 'es-pullup', 'ws-upper', {
        bodyweightMode: 'added',
        loadKg: null,
        addedWeightKg: 5,
        reps: 6,
      }),
      makeSet('st-bss-r', 'es-bss', 'ws-lower', {
        side: 'right',
        loadKg: 12,
        loadConvention: 'perDumbbell',
        reps: 10,
        orderIndex: 1,
      }),
      makeSet('st-bench-work', 'es-bench', 'ws-upper', { orderIndex: 1 }),
      makeSet('st-ghost', 'es-ghost', 'ws-discarded'),
      makeSet('st-bench-warm', 'es-bench', 'ws-upper', {
        isWarmup: true,
        loadKg: 40,
        reps: 10,
        rir: null,
        orderIndex: 0,
      }),
      makeSet('st-incline-1', 'es-incline', 'ws-upper', {
        loadKg: 22,
        loadConvention: 'perDumbbell',
        reps: 10,
        rir: 1,
      }),
      makeSet('st-bss-l', 'es-bss', 'ws-lower', {
        side: 'left',
        loadKg: 12,
        loadConvention: 'perDumbbell',
        reps: 10,
        orderIndex: 0,
      }),
    ]

    const csv = workoutHistoryCsv(
      [upper, lower, discarded],
      [esBench, esIncline, esPullup, esBss, esGhost],
      sets,
    )

    const expected =
      [
        HEADER,
        // Lower session (earlier date) first; unilateral sides in set order
        ['2026-08-02', 'Lower / Legs', 'Bulgarian Split Squat', '', '1', 'false', 'left', '12', 'perDumbbell', 'none', '', '', '10', '2', 'true'].join(','),
        ['2026-08-02', 'Lower / Legs', 'Bulgarian Split Squat', '', '2', 'false', 'right', '12', 'perDumbbell', 'none', '', '', '10', '2', 'true'].join(','),
        // Upper A: warm-up flagged, null rir/load empty
        ['2026-08-04', 'Upper A', 'Bench Press', '', '1', 'true', '', '40', '', 'none', '', '', '10', '', 'true'].join(','),
        ['2026-08-04', 'Upper A', 'Bench Press', '', '2', 'false', '', '60', '', 'none', '', '', '8', '2', 'true'].join(','),
        // variant containing comma and quotes is RFC 4180 quoted
        ['2026-08-04', 'Upper A', 'Incline Dumbbell Press', '"Wide, ""comfort"" grip"', '1', 'false', '', '22', 'perDumbbell', 'none', '', '', '10', '1', 'true'].join(','),
        // bodyweight+added set: no loadKg, addedWeightKg populated
        ['2026-08-04', 'Upper A', 'Pull-Up', '', '1', 'false', '', '', '', 'added', '5', '', '6', '2', 'true'].join(','),
      ].join('\r\n') + '\r\n'

    expect(csv).toBe(expected)
    // discarded sessions are not history
    expect(csv).not.toContain('Ghost Press')
  })

  it('returns just the header for empty history', () => {
    expect(workoutHistoryCsv([], [], [])).toBe(HEADER + '\r\n')
  })

  it('does not mutate the input arrays', () => {
    const s1 = makeSession('a', { dateKey: '2026-08-04' })
    const s2 = makeSession('b', { dateKey: '2026-08-02' })
    const sessions = [s1, s2]
    workoutHistoryCsv(sessions, [], [])
    expect(sessions[0]).toBe(s1)
    expect(sessions[1]).toBe(s2)
  })
})
