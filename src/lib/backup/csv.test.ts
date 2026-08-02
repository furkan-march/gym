import type {
  BodyMetric,
  CardioSession,
  DailyActivity,
  ExerciseSession,
  SetLog,
  WorkoutSession,
} from '../types'
import {
  bodyMetricsCsv,
  cardioSessionsCsv,
  dailyStepsCsv,
  exerciseHistoryCsv,
  workoutHistoryCsv,
} from './csv'

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

function makeBodyMetric(id: string, dateKey: string, overrides: Partial<BodyMetric> = {}): BodyMetric {
  return {
    id,
    dateKey,
    weightKg: 90,
    waistCm: 100,
    bodyFatPct: 24.5,
    createdAt: T,
    updatedAt: T,
    ...overrides,
  }
}

describe('bodyMetricsCsv', () => {
  it('serializes one row per day, sorted by date, with empty cells for unmeasured fields', () => {
    const metrics = [
      // deliberately out of order
      makeBodyMetric('bm-2', '2026-08-03', { weightKg: 89.4, waistCm: null, bodyFatPct: null }),
      makeBodyMetric('bm-1', '2026-08-01'),
      makeBodyMetric('bm-3', '2026-08-05', { weightKg: null, waistCm: 99.5, bodyFatPct: 24.1 }),
    ]

    expect(bodyMetricsCsv(metrics)).toBe(
      [
        'date,weightKg,waistCm,bodyFatPct',
        '2026-08-01,90,100,24.5',
        '2026-08-03,89.4,,',
        '2026-08-05,,99.5,24.1',
      ].join('\r\n') + '\r\n',
    )
  })

  it('returns just the header for no metrics', () => {
    expect(bodyMetricsCsv([])).toBe('date,weightKg,waistCm,bodyFatPct\r\n')
  })
})

function makeActivity(id: string, dateKey: string, steps: number | null): DailyActivity {
  return { id, dateKey, steps, createdAt: T, updatedAt: T }
}

describe('dailyStepsCsv', () => {
  it('serializes one row per day with a step count, sorted by date, skipping null-step days', () => {
    const activities = [
      makeActivity('da-2', '2026-08-03', 12500),
      makeActivity('da-3', '2026-08-04', null), // no count logged — skipped
      makeActivity('da-1', '2026-08-01', 8000),
    ]

    expect(dailyStepsCsv(activities)).toBe(
      ['date,steps', '2026-08-01,8000', '2026-08-03,12500'].join('\r\n') + '\r\n',
    )
  })

  it('returns just the header when no days have step counts', () => {
    expect(dailyStepsCsv([makeActivity('da-1', '2026-08-01', null)])).toBe('date,steps\r\n')
  })
})

function makeCardio(id: string, overrides: Partial<CardioSession> = {}): CardioSession {
  return {
    id,
    dateKey: '2026-08-02',
    type: 'inclineTreadmill',
    minutes: 30,
    distanceKm: 2.4,
    avgHeartRate: 128,
    perceivedIntensity: 3,
    isZone2: true,
    createdAt: T,
    updatedAt: T,
    ...overrides,
  }
}

describe('cardioSessionsCsv', () => {
  it('serializes one row per session, sorted by date then log time, with empty cells for nulls', () => {
    const cardio = [
      makeCardio('c-later', {
        dateKey: '2026-08-04',
        type: 'outdoorWalk',
        minutes: 45,
        distanceKm: null,
        avgHeartRate: null,
        perceivedIntensity: null,
        isZone2: false,
        createdAt: '2026-08-04T18:00:00.000Z',
      }),
      // same day as c-first but logged later — must come second
      makeCardio('c-second', {
        type: 'stationaryBike',
        minutes: 20,
        distanceKm: null,
        perceivedIntensity: 2,
        createdAt: '2026-08-02T19:00:00.000Z',
      }),
      makeCardio('c-first', { createdAt: '2026-08-02T08:00:00.000Z' }),
    ]

    expect(cardioSessionsCsv(cardio)).toBe(
      [
        'date,type,minutes,distanceKm,avgHeartRate,perceivedIntensity,zone2',
        '2026-08-02,inclineTreadmill,30,2.4,128,3,true',
        '2026-08-02,stationaryBike,20,,128,2,true',
        '2026-08-04,outdoorWalk,45,,,,false',
      ].join('\r\n') + '\r\n',
    )
  })

  it('returns just the header for no cardio', () => {
    expect(cardioSessionsCsv([])).toBe(
      'date,type,minutes,distanceKm,avgHeartRate,perceivedIntensity,zone2\r\n',
    )
  })
})

const EXERCISE_HISTORY_HEADER =
  'date,exercise,variant,equipmentContextId,set,side,loadKg,loadConvention,bodyweightMode,addedWeightKg,assistanceWeightKg,reps,rir,painFlag,formQuality'

describe('exerciseHistoryCsv', () => {
  it('serializes completed working sets only, ordered by date and orderIndex, with quoting', () => {
    const lower = makeSession('ws-lower', {
      dateKey: '2026-08-02',
      templateName: 'Lower / Legs',
      templateKind: 'lower',
      startedAt: '2026-08-02T09:00:00.000Z',
    })
    const upper = makeSession('ws-upper')
    const discarded = makeSession('ws-discarded', { dateKey: '2026-08-03', status: 'discarded' })

    const esBss = makeExerciseSession('es-bss', 'ws-lower', 'Bulgarian Split Squat')
    const esBench = makeExerciseSession('es-bench', 'ws-upper', 'Bench Press', { orderIndex: 0 })
    const esIncline = makeExerciseSession('es-incline', 'ws-upper', 'Incline Dumbbell Press', {
      orderIndex: 1,
      variantName: 'Wide, "comfort" grip',
    })
    const esPullup = makeExerciseSession('es-pullup', 'ws-upper', 'Pull-Up', { orderIndex: 2 })
    const esGhost = makeExerciseSession('es-ghost', 'ws-discarded', 'Ghost Press')

    const sets = [
      // deliberately shuffled; warmups and uncompleted sets must be excluded
      makeSet('st-pullup-1', 'es-pullup', 'ws-upper', {
        bodyweightMode: 'assistedMachine',
        loadKg: null,
        assistanceWeightKg: 10,
        reps: 6,
        painFlag: true,
        formQuality: 'poor',
      }),
      makeSet('st-bench-warm', 'es-bench', 'ws-upper', {
        isWarmup: true,
        loadKg: 40,
        reps: 10,
        rir: null,
        orderIndex: 0,
      }),
      makeSet('st-bench-work', 'es-bench', 'ws-upper', {
        equipmentContextId: 'ctx-flat-barbell',
        orderIndex: 1,
      }),
      makeSet('st-bench-skipped', 'es-bench', 'ws-upper', { completed: false, orderIndex: 2 }),
      makeSet('st-incline-1', 'es-incline', 'ws-upper', {
        loadKg: 22,
        loadConvention: 'perDumbbell',
        reps: 10,
        rir: 1,
      }),
      makeSet('st-bss-r', 'es-bss', 'ws-lower', {
        side: 'right',
        loadKg: 12,
        loadConvention: 'perDumbbell',
        reps: 10,
        orderIndex: 1,
      }),
      makeSet('st-bss-l', 'es-bss', 'ws-lower', {
        side: 'left',
        loadKg: 12,
        loadConvention: 'perDumbbell',
        reps: 10,
        orderIndex: 0,
      }),
      makeSet('st-ghost', 'es-ghost', 'ws-discarded'),
    ]

    const csv = exerciseHistoryCsv(
      [esBench, esIncline, esPullup, esBss, esGhost],
      sets,
      [upper, lower, discarded],
    )

    const expected =
      [
        EXERCISE_HISTORY_HEADER,
        // Lower session (earlier date) first; unilateral sides in set order
        ['2026-08-02', 'Bulgarian Split Squat', '', '', '1', 'left', '12', 'perDumbbell', 'none', '', '', '10', '2', 'false', ''].join(','),
        ['2026-08-02', 'Bulgarian Split Squat', '', '', '2', 'right', '12', 'perDumbbell', 'none', '', '', '10', '2', 'false', ''].join(','),
        // Bench: warm-up and uncompleted set excluded, working set renumbered to 1
        ['2026-08-04', 'Bench Press', '', 'ctx-flat-barbell', '1', '', '60', '', 'none', '', '', '8', '2', 'false', ''].join(','),
        // variant containing comma and quotes is RFC 4180 quoted
        ['2026-08-04', 'Incline Dumbbell Press', '"Wide, ""comfort"" grip"', '', '1', '', '22', 'perDumbbell', 'none', '', '', '10', '1', 'false', ''].join(','),
        // assisted bodyweight set with pain and form flags
        ['2026-08-04', 'Pull-Up', '', '', '1', '', '', '', 'assistedMachine', '', '10', '6', '2', 'true', 'poor'].join(','),
      ].join('\r\n') + '\r\n'

    expect(csv).toBe(expected)
    expect(csv).not.toContain('Ghost Press')
    expect(csv).not.toContain('40') // warm-up load never appears
  })

  it('returns just the header for empty history', () => {
    expect(exerciseHistoryCsv([], [], [])).toBe(EXERCISE_HISTORY_HEADER + '\r\n')
  })
})
