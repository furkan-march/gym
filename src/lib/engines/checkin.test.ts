import type {
  BodyMetric,
  CardioSession,
  DailyActivity,
  ExerciseSession,
  NutritionAdherenceLog,
  PostureRoutineLog,
  PostureRoutineTemplate,
  PrescriptionSnapshot,
  ScheduledDay,
  SetLog,
  WorkoutSession,
} from '../types'
import {
  adjustmentSuggestion,
  buildWeeklyCheckIn,
  isSessionCompleted,
  type WeeklyCheckInData,
} from './checkin'

const T = '2026-08-10T08:00:00.000Z'

// Fixed week under test: Monday 2026-08-03 .. Sunday 2026-08-09.
const WEEK_START = '2026-08-03'

function metric(
  dateKey: string,
  weightKg: number | null,
  waistCm: number | null = null,
): BodyMetric {
  return {
    id: `bm-${dateKey}`,
    dateKey,
    weightKg,
    waistCm,
    bodyFatPct: null,
    createdAt: T,
    updatedAt: T,
  }
}

function session(
  id: string,
  dateKey: string,
  status: WorkoutSession['status'] = 'completed',
): WorkoutSession {
  return {
    id,
    templateId: 'tpl-upper-a',
    templateName: 'Upper A',
    templateKind: 'upperA',
    dateKey,
    startedAt: T,
    finishedAt: status === 'completed' ? T : null,
    status,
    bodyweightAtSessionKg: 86.5,
    activeSeconds: 3600,
    lastActivatedAt: null,
    createdAt: T,
    updatedAt: T,
  }
}

function prescription(prescribedSets: number, isOptional = false): PrescriptionSnapshot {
  return {
    prescribedSets,
    repRangeMin: 6,
    repRangeMax: 8,
    targetRIRMin: 1,
    targetRIRMax: 2,
    restSeconds: 150,
    incrementKg: 2.5,
    isOptional,
    supersetGroup: null,
  }
}

function exSession(
  id: string,
  workoutSessionId: string,
  prescribedSets: number,
  over: Partial<ExerciseSession> = {},
): ExerciseSession {
  return {
    id,
    workoutSessionId,
    exerciseId: 'ex-bench-press',
    variantId: null,
    equipmentContextId: null,
    exerciseName: 'Bench Press',
    variantName: null,
    status: 'completed',
    orderIndex: 0,
    isUnplanned: false,
    substitutedByExerciseSessionId: null,
    substitutedFromExerciseSessionId: null,
    prescription: prescription(prescribedSets),
    createdAt: T,
    updatedAt: T,
    ...over,
  }
}

let setSeq = 0
function set(
  workoutSessionId: string,
  exerciseSessionId: string,
  over: Partial<SetLog> = {},
): SetLog {
  setSeq++
  return {
    id: `set-${setSeq}`,
    workoutSessionId,
    exerciseSessionId,
    exerciseId: 'ex-bench-press',
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
    ...over,
  }
}

function schedDay(weekday: ScheduledDay['weekday'], planKind: ScheduledDay['planKind']): ScheduledDay {
  return {
    id: String(weekday),
    weekday,
    planKind,
    templateId: null,
    postureRequired: false,
    postureOptional: false,
    cardioMinutesMin: null,
    cardioMinutesMax: null,
    stepsOptional: false,
    updatedAt: T,
  }
}

// Default schedule: strength on Sunday (0), Tuesday (2), Thursday (4).
const DAYS: ScheduledDay[] = [
  schedDay(0, 'strength'),
  schedDay(1, 'recovery'),
  schedDay(2, 'strength'),
  schedDay(3, 'zone2'),
  schedDay(4, 'strength'),
  schedDay(5, 'recovery'),
  schedDay(6, 'rest'),
]

const POSTURE: PostureRoutineTemplate = {
  id: 'posture',
  items: [
    { id: 'po-1', name: 'Chin Tuck', prescription: '2 × 15' },
    { id: 'po-2', name: 'Doorway Pec Stretch', prescription: '2 × 45 s' },
    { id: 'po-3', name: 'Wall Slide', prescription: '2 × 12' },
    { id: 'po-4', name: 'Dead Hang', prescription: '2 × 30 s' },
    { id: 'po-5', name: 'Thoracic Extension', prescription: '2 minutes' },
  ],
  requiredDays: [1, 5], // Monday and Friday
  optionalDays: [3, 6],
  updatedAt: T,
}

function postureLog(dateKey: string, completedCount: number, totalItems = 5): PostureRoutineLog {
  return {
    id: `pl-${dateKey}`,
    dateKey,
    completedItemIds: Array.from({ length: completedCount }, (_, i) => `po-${i + 1}`),
    totalItems,
    createdAt: T,
    updatedAt: T,
  }
}

function nutri(
  dateKey: string,
  calories: NutritionAdherenceLog['calories'],
  protein: NutritionAdherenceLog['protein'],
): NutritionAdherenceLog {
  return {
    id: `nu-${dateKey}`,
    dateKey,
    calories,
    protein,
    fruitVeg: null,
    water: null,
    hunger: null,
    createdAt: T,
    updatedAt: T,
  }
}

function activity(dateKey: string, steps: number | null): DailyActivity {
  return { id: `da-${dateKey}`, dateKey, steps, createdAt: T, updatedAt: T }
}

function cardio(dateKey: string, minutes: number): CardioSession {
  return {
    id: `cs-${dateKey}-${minutes}`,
    dateKey,
    type: 'inclineTreadmill',
    minutes,
    distanceKm: null,
    avgHeartRate: null,
    perceivedIntensity: 3,
    isZone2: true,
    createdAt: T,
    updatedAt: T,
  }
}

function baseData(over: Partial<WeeklyCheckInData> = {}): WeeklyCheckInData {
  return {
    metrics: [],
    sessions: [],
    exerciseSessions: [],
    sets: [],
    days: DAYS,
    activities: [],
    cardio: [],
    postureLogs: [],
    postureTemplate: POSTURE,
    nutritionLogs: [],
    programStart: '2026-08-02',
    todayKey: '2026-08-10',
    now: T,
    ...over,
  }
}

describe('buildWeeklyCheckIn aggregation (week 2026-08-03 .. 2026-08-09)', () => {
  // ws1: 4 of 7 prescribed working sets completed (57%) -> counts.
  const ws1 = session('ws1', '2026-08-04')
  const es1 = exSession('es1', 'ws1', 4)
  const es2 = exSession('es2', 'ws1', 3)
  // ws2: 1 of 8 (12.5%) -> does not count despite Finish being tapped.
  const ws2 = session('ws2', '2026-08-06')
  const es3 = exSession('es3', 'ws2', 4)
  const es4 = exSession('es4', 'ws2', 4)
  // ws3: discarded -> never counts.
  const ws3 = session('ws3', '2026-08-09', 'discarded')
  const es5 = exSession('es5', 'ws3', 4)

  const data = baseData({
    metrics: [
      // previous window (07-27 .. 08-02), avg 86.9
      metric('2026-07-28', 87.0),
      metric('2026-07-30', 86.9),
      metric('2026-08-01', 86.8),
      // current window = the covered week, avg 86.4
      metric('2026-08-04', 86.6),
      metric('2026-08-05', null, 88.0), // waist-only entry
      metric('2026-08-06', 86.4),
      metric('2026-08-08', 86.2, 87.5), // latest waist in week
    ],
    sessions: [ws1, ws2, ws3],
    exerciseSessions: [es1, es2, es3, es4, es5],
    sets: [
      set('ws1', 'es1'),
      set('ws1', 'es1'),
      set('ws1', 'es1'),
      set('ws1', 'es1'),
      set('ws1', 'es1', { isWarmup: true }), // warm-up never counts
      set('ws1', 'es2', { completed: false }),
      set('ws2', 'es3'),
      set('ws3', 'es5'),
      set('ws3', 'es5'),
      set('ws3', 'es5'),
      set('ws3', 'es5'),
    ],
    activities: [
      activity('2026-08-02', 20000), // outside the week
      activity('2026-08-03', 8000),
      activity('2026-08-05', 9000),
      activity('2026-08-06', null), // no entry value -> ignored
      activity('2026-08-08', 10000),
    ],
    cardio: [cardio('2026-08-02', 60), cardio('2026-08-05', 35), cardio('2026-08-08', 30)],
    postureLogs: [postureLog('2026-08-03', 5), postureLog('2026-08-07', 3)],
    nutritionLogs: [
      nutri('2026-08-01', 'over', 'missed'), // outside the week
      nutri('2026-08-03', 'under', 'reached'),
      nutri('2026-08-04', 'onTarget', 'nearly'),
      nutri('2026-08-05', 'over', 'missed'),
      nutri('2026-08-06', 'notTracked', 'notTracked'),
    ],
  })

  const checkin = buildWeeklyCheckIn(WEEK_START, data)

  it('computes current and previous 7-day averages and the percent change', () => {
    expect(checkin.currentAvgWeightKg).toBeCloseTo(86.4, 10)
    expect(checkin.previousAvgWeightKg).toBeCloseTo(86.9, 10)
    expect(checkin.weightChangePct).toBeCloseTo(-0.575374, 4)
  })

  it('takes the latest waist measurement inside the week', () => {
    expect(checkin.waistCm).toBe(87.5)
  })

  it('counts strength sessions with the 50%-of-prescribed-sets rule', () => {
    expect(checkin.strengthSessionsScheduled).toBe(3) // Tue, Thu, Sun
    expect(checkin.strengthSessionsCompleted).toBe(1) // only ws1
  })

  it('averages steps over logged days only and sums cardio minutes in the week', () => {
    expect(checkin.avgSteps).toBe(9000)
    expect(checkin.cardioMinutes).toBe(65)
  })

  it('computes posture adherence from fully completed required days', () => {
    expect(checkin.postureAdherencePct).toBe(50) // Mon done, Fri partial
  })

  it('computes calorie and protein adherence over tracked days', () => {
    expect(checkin.calorieAdherencePct).toBeCloseTo(66.6667, 3) // under+onTarget of 3 tracked
    expect(checkin.proteinAdherencePct).toBeCloseTo(66.6667, 3) // reached+nearly of 3 tracked
  })

  it('leaves the user-entered 1-5 ratings null and uses a deterministic id', () => {
    expect(checkin.hunger).toBeNull()
    expect(checkin.energy).toBeNull()
    expect(checkin.gymPerformance).toBeNull()
    expect(checkin.sleep).toBeNull()
    expect(checkin.stress).toBeNull()
    expect(checkin.id).toBe('checkin-2026-08-03')
    expect(checkin.weekStartDateKey).toBe(WEEK_START)
    expect(checkin.createdAt).toBe(T)
    expect(checkin.updatedAt).toBe(T)
  })
})

describe('buildWeeklyCheckIn proration and empty states', () => {
  it('does not count scheduled days in the future', () => {
    const checkin = buildWeeklyCheckIn(WEEK_START, baseData({ todayKey: '2026-08-07' }))
    expect(checkin.strengthSessionsScheduled).toBe(2) // Tue + Thu; Sunday is still future
  })

  it('does not count scheduled days before the program start (prorated first week)', () => {
    const checkin = buildWeeklyCheckIn(WEEK_START, baseData({ programStart: '2026-08-05' }))
    expect(checkin.strengthSessionsScheduled).toBe(2) // Thu + Sun only
  })

  it('handles a week entirely before the program start', () => {
    const checkin = buildWeeklyCheckIn(WEEK_START, baseData({ programStart: '2026-09-01' }))
    expect(checkin.strengthSessionsScheduled).toBe(0)
    expect(checkin.postureAdherencePct).toBeNull()
  })

  it('returns nulls and zeros for an empty week', () => {
    const checkin = buildWeeklyCheckIn(WEEK_START, baseData())
    expect(checkin.currentAvgWeightKg).toBeNull()
    expect(checkin.previousAvgWeightKg).toBeNull()
    expect(checkin.weightChangePct).toBeNull()
    expect(checkin.waistCm).toBeNull()
    expect(checkin.strengthSessionsCompleted).toBe(0)
    expect(checkin.avgSteps).toBeNull()
    expect(checkin.cardioMinutes).toBe(0)
    expect(checkin.postureAdherencePct).toBe(0) // required days existed, none completed
    expect(checkin.calorieAdherencePct).toBeNull()
    expect(checkin.proteinAdherencePct).toBeNull()
  })

  it('returns null posture adherence without a posture template', () => {
    const checkin = buildWeeklyCheckIn(WEEK_START, baseData({ postureTemplate: null }))
    expect(checkin.postureAdherencePct).toBeNull()
  })
})

describe('isSessionCompleted edge cases', () => {
  it('doubles the prescribed count for per-side logging', () => {
    const ws = session('ws', '2026-08-04')
    const es = exSession('es', 'ws', 2) // 2 per side -> 4 actual working sets
    const twoLeft = [
      set('ws', 'es', { side: 'left' }),
      set('ws', 'es', { side: 'left' }),
    ]
    expect(isSessionCompleted(ws, [es], twoLeft)).toBe(true) // 2/4 = exactly 50%
    const oneLeft = [set('ws', 'es', { side: 'left' })]
    expect(isSessionCompleted(ws, [es], oneLeft)).toBe(false) // 1/4 = 25%
  })

  it('excludes optional exercises from the prescribed denominator', () => {
    const ws = session('ws', '2026-08-04')
    const main = exSession('es-main', 'ws', 4)
    const optional = exSession('es-opt', 'ws', 3, { prescription: prescription(3, true) })
    const sets = [set('ws', 'es-main'), set('ws', 'es-main')]
    // 2/4 = 50% of required work; with the optional 3 included it would be 2/7.
    expect(isSessionCompleted(ws, [main, optional], sets)).toBe(true)
  })

  it('counts a substitution pair once, via the replacement', () => {
    const ws = session('ws', '2026-08-04')
    const original = exSession('es-orig', 'ws', 3, {
      status: 'substituted',
      substitutedByExerciseSessionId: 'es-repl',
    })
    const replacement = exSession('es-repl', 'ws', 3, {
      isUnplanned: true,
      substitutedFromExerciseSessionId: 'es-orig',
    })
    const sets = [set('ws', 'es-repl'), set('ws', 'es-repl')]
    // 2/3 of the replacement's prescription; double-counting would give 2/6.
    expect(isSessionCompleted(ws, [original, replacement], sets)).toBe(true)
  })

  it('ignores extra unplanned exercises in the denominator', () => {
    const ws = session('ws', '2026-08-04')
    const planned = exSession('es-p', 'ws', 4)
    const extra = exSession('es-x', 'ws', 3, { isUnplanned: true })
    const sets = [set('ws', 'es-p'), set('ws', 'es-p')]
    expect(isSessionCompleted(ws, [planned, extra], sets)).toBe(true) // 2/4
  })

  it('never counts a session that was not finished', () => {
    const ws = session('ws', '2026-08-04', 'active')
    const es = exSession('es', 'ws', 2)
    const sets = [set('ws', 'es'), set('ws', 'es')]
    expect(isSessionCompleted(ws, [es], sets)).toBe(false)
  })
})

describe('adjustmentSuggestion (SPEC 24 ADJUSTMENT LOGIC)', () => {
  const TODAY = '2026-08-24'

  // Flat: avg 14 days ago 86.5667, avg today 86.5 -> plateau, not excessive loss.
  const FLAT = [
    metric('2026-08-05', 86.6),
    metric('2026-08-07', 86.5),
    metric('2026-08-09', 86.6),
    metric('2026-08-19', 86.5),
    metric('2026-08-21', 86.5),
    metric('2026-08-23', 86.5),
  ]

  // Fast: previous-week avg 86.5, current avg 85.5 -> loss 1.156% per week.
  const FAST_LOSS = [
    metric('2026-08-12', 86.5),
    metric('2026-08-14', 86.5),
    metric('2026-08-16', 86.5),
    metric('2026-08-19', 85.6),
    metric('2026-08-21', 85.5),
    metric('2026-08-23', 85.4),
  ]

  function input(over: Partial<Parameters<typeof adjustmentSuggestion>[0]> = {}) {
    return {
      metrics: FLAT,
      todayKey: TODAY,
      adherencePct: 90,
      trackedDays14: 12,
      strengthDeclining: false,
      waist: 'stable' as const,
      ...over,
    }
  }

  it('suggests a plateau adjustment after 14 flat days with high adherence', () => {
    const s = adjustmentSuggestion(input())
    expect(s.kind).toBe('plateauAdjust')
    expect(s.options).toHaveLength(2)
    expect(s.options[0]).toMatch(/100-150 kcal/)
    expect(s.options[1]).toMatch(/1,500-2,000/)
    // Reasoning in plain sentences; never auto-applied.
    expect(s.explanation).toMatch(/14 days/)
    expect(s.explanation).toMatch(/never changes your targets automatically/)
  })

  it('suggests nothing on a plateau with poor adherence', () => {
    expect(adjustmentSuggestion(input({ adherencePct: 60 })).kind).toBe('none')
    expect(adjustmentSuggestion(input({ adherencePct: null })).kind).toBe('none')
  })

  it('suggests nothing on a plateau with fewer than 10 of 14 days tracked', () => {
    expect(adjustmentSuggestion(input({ trackedDays14: 8 })).kind).toBe('none')
  })

  it('flags excessive loss and mentions muscle retention', () => {
    const s = adjustmentSuggestion(input({ metrics: FAST_LOSS }))
    expect(s.kind).toBe('excessiveLoss')
    expect(s.explanation).toMatch(/muscle/)
    expect(s.options.some((o) => /calorie/i.test(o))).toBe(true)
  })

  it('does not react to one unusual weigh-in', () => {
    const oneOdd = [
      metric('2026-08-12', 86.5),
      metric('2026-08-14', 86.5),
      metric('2026-08-16', 86.5),
      metric('2026-08-23', 84.0),
    ]
    const s = adjustmentSuggestion(input({ metrics: oneOdd }))
    expect(s.kind).toBe('none')
  })

  it('routes declining strength to a recovery review, not eating less', () => {
    const s = adjustmentSuggestion(input({ strengthDeclining: true }))
    expect(s.kind).toBe('reviewRecovery')
    expect(s.explanation).toMatch(/not a reason to eat less/)
    expect(s.options).toHaveLength(6)
    expect(s.options.join(' ')).toMatch(/sleep/i)
    expect(s.options.join(' ')).toMatch(/joint/i)
  })

  it('interprets flat scale + decreasing waist + stable strength neutrally', () => {
    const s = adjustmentSuggestion(input({ waist: 'decreasing' }))
    expect(s.kind).toBe('holdSteady')
    expect(s.options).toHaveLength(0)
    expect(s.explanation).toMatch(/no immediate change/i)
  })

  it('prioritizes the excessive-loss warning over other signals', () => {
    const s = adjustmentSuggestion(input({ metrics: FAST_LOSS, strengthDeclining: true }))
    expect(s.kind).toBe('excessiveLoss')
  })

  it('suggests nothing when weight is trending down normally', () => {
    const losing = [
      metric('2026-08-05', 87.0),
      metric('2026-08-07', 87.0),
      metric('2026-08-09', 87.0),
      metric('2026-08-19', 86.5),
      metric('2026-08-21', 86.5),
      metric('2026-08-23', 86.5),
    ]
    expect(adjustmentSuggestion(input({ metrics: losing })).kind).toBe('none')
  })
})
