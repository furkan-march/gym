import { TEMPLATE_IDS } from '../seed/seed'
import type {
  DateKey,
  ExerciseSession,
  PlanKind,
  PrescriptionSnapshot,
  ScheduledDay,
  SetLog,
  Weekday,
  WorkoutSession,
} from '../types'
import { isSessionCompleted, weeklyStrengthAdherence } from './adherence'

/** Fixed dates only (SPEC 35): 2026-08-02 is a Sunday, program start. */

const T = '2026-08-02T10:00:00.000Z'
const PROGRAM_START: DateKey = '2026-08-02'

let seq = 0
const nextId = (prefix: string): string => `${prefix}-${++seq}`

const PRESCRIPTION: PrescriptionSnapshot = {
  prescribedSets: 4,
  repRangeMin: 6,
  repRangeMax: 8,
  targetRIRMin: 1,
  targetRIRMax: 2,
  restSeconds: 150,
  incrementKg: 2.5,
  isOptional: false,
  supersetGroup: null,
}

function ws(over: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: nextId('ws'),
    templateId: TEMPLATE_IDS.lower,
    templateName: 'Lower / Legs',
    templateKind: 'lower',
    dateKey: '2026-08-02',
    startedAt: T,
    finishedAt: T,
    status: 'completed',
    bodyweightAtSessionKg: 87,
    activeSeconds: 3600,
    lastActivatedAt: null,
    createdAt: T,
    updatedAt: T,
    ...over,
  }
}

function es(over: Partial<ExerciseSession> & { workoutSessionId: string }): ExerciseSession {
  return {
    id: nextId('es'),
    exerciseId: 'ex-squat',
    variantId: null,
    equipmentContextId: null,
    exerciseName: 'Squat',
    variantName: null,
    status: 'completed',
    orderIndex: 0,
    isUnplanned: false,
    substitutedByExerciseSessionId: null,
    substitutedFromExerciseSessionId: null,
    prescription: PRESCRIPTION,
    createdAt: T,
    updatedAt: T,
    ...over,
  }
}

function set(
  over: Partial<SetLog> & { workoutSessionId: string; exerciseSessionId: string },
): SetLog {
  return {
    id: nextId('set'),
    exerciseId: 'ex-squat',
    variantId: null,
    equipmentContextId: null,
    loadKg: 80,
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

/** n completed working sets for one exercise session. */
function workingSets(e: ExerciseSession, n: number, over: Partial<SetLog> = {}): SetLog[] {
  return Array.from({ length: n }, (_, i) =>
    set({ workoutSessionId: e.workoutSessionId, exerciseSessionId: e.id, orderIndex: i, ...over }),
  )
}

describe('isSessionCompleted (SPEC 24, 50% rule)', () => {
  it('requires Finish Workout: an active session never counts', () => {
    const s = ws({ status: 'active', finishedAt: null })
    const e = es({ workoutSessionId: s.id })
    expect(isSessionCompleted(s, [e], workingSets(e, 4))).toBe(false)
  })

  it('a discarded session never counts', () => {
    const s = ws({ status: 'discarded' })
    const e = es({ workoutSessionId: s.id })
    expect(isSessionCompleted(s, [e], workingSets(e, 4))).toBe(false)
  })

  it('exactly 50% of prescribed working sets completed counts', () => {
    const s = ws()
    const e = es({ workoutSessionId: s.id }) // 4 prescribed
    expect(isSessionCompleted(s, [e], workingSets(e, 2))).toBe(true)
  })

  it('below 50% does not count', () => {
    const s = ws()
    const e = es({ workoutSessionId: s.id })
    expect(isSessionCompleted(s, [e], workingSets(e, 1))).toBe(false)
  })

  it('warm-up sets do not count toward completion', () => {
    const s = ws()
    const e = es({ workoutSessionId: s.id })
    const sets = [...workingSets(e, 1), ...workingSets(e, 3, { isWarmup: true })]
    expect(isSessionCompleted(s, [e], sets)).toBe(false)
  })

  it('logged-but-not-completed sets do not count', () => {
    const s = ws()
    const e = es({ workoutSessionId: s.id })
    const sets = [...workingSets(e, 1), ...workingSets(e, 3, { completed: false, completedAt: null })]
    expect(isSessionCompleted(s, [e], sets)).toBe(false)
  })

  it('skipped exercises stay in the denominator (skipping prescribed work is what the rule measures)', () => {
    const s = ws()
    const done = es({ workoutSessionId: s.id }) // 4 prescribed
    const skipped = es({ workoutSessionId: s.id, status: 'skipped', orderIndex: 1 }) // 4 prescribed
    // 2 of 8 prescribed sets completed -> below 50%, does not count.
    expect(isSessionCompleted(s, [done, skipped], workingSets(done, 2))).toBe(false)
    // 4 of 8 prescribed sets completed -> exactly 50%, counts.
    expect(isSessionCompleted(s, [done, skipped], workingSets(done, 4))).toBe(true)
  })

  it('optional exercises never penalize: excluded from the denominator', () => {
    const s = ws()
    const main = es({ workoutSessionId: s.id }) // 4 prescribed
    const optional = es({ workoutSessionId: s.id, orderIndex: 1 })
    optional.prescription = { ...optional.prescription, isOptional: true }
    // 2 of 4 non-optional sets -> 50%, counts even though optional work was untouched.
    expect(isSessionCompleted(s, [main, optional], workingSets(main, 2))).toBe(true)
  })

  it('a substituted original is excluded; its replacement counts with its own snapshot', () => {
    const s = ws()
    const original = es({ workoutSessionId: s.id, status: 'substituted' })
    const replacement = es({
      workoutSessionId: s.id,
      exerciseId: 'ex-leg-press',
      exerciseName: 'Leg Press',
      isUnplanned: true,
      substitutedFromExerciseSessionId: original.id,
      prescription: { ...PRESCRIPTION, prescribedSets: 3 },
    })
    original.substitutedByExerciseSessionId = replacement.id
    // Sets logged on the original before substituting must not count.
    const staleSets = workingSets(original, 3)
    expect(
      isSessionCompleted(s, [original, replacement], [...staleSets, ...workingSets(replacement, 2)]),
    ).toBe(true)
    expect(isSessionCompleted(s, [original, replacement], [...staleSets, ...workingSets(replacement, 1)])).toBe(
      false,
    )
  })

  it('unplanned extra exercises are not prescribed work', () => {
    const s = ws()
    const planned = es({ workoutSessionId: s.id }) // 4 prescribed
    const extra = es({ workoutSessionId: s.id, isUnplanned: true, orderIndex: 9 })
    // 1 of 4 prescribed done; 4 unplanned sets cannot rescue the session.
    const sets = [...workingSets(planned, 1), ...workingSets(extra, 4)]
    expect(isSessionCompleted(s, [planned, extra], sets)).toBe(false)
  })

  it('unilateral prescriptions count per side (x2)', () => {
    const s = ws()
    const e = es({
      workoutSessionId: s.id,
      exerciseId: 'ex-bulgarian-split-squat',
      exerciseName: 'Bulgarian Split Squat',
      prescription: { ...PRESCRIPTION, prescribedSets: 2 }, // per side => 4 total
    })
    const twoSides = [...workingSets(e, 1, { side: 'left' }), ...workingSets(e, 1, { side: 'right' })]
    expect(isSessionCompleted(s, [e], twoSides)).toBe(true) // 2 of 4
    expect(isSessionCompleted(s, [e], workingSets(e, 1, { side: 'left' }))).toBe(false) // 1 of 4
  })

  it('a fully unplanned session counts once any working set is completed', () => {
    const s = ws({ templateId: null, templateName: 'Unplanned', templateKind: 'custom' })
    const e = es({ workoutSessionId: s.id, isUnplanned: true })
    expect(isSessionCompleted(s, [e], workingSets(e, 1))).toBe(true)
    expect(isSessionCompleted(s, [e], workingSets(e, 1, { isWarmup: true }))).toBe(false)
  })

  it('ignores exercise sessions and sets from other workouts', () => {
    const s = ws()
    const mine = es({ workoutSessionId: s.id })
    const other = ws()
    const theirs = es({ workoutSessionId: other.id })
    const sets = [...workingSets(mine, 2), ...workingSets(theirs, 4)]
    expect(isSessionCompleted(s, [mine, theirs], sets)).toBe(true)
    expect(isSessionCompleted(s, [mine, theirs], workingSets(theirs, 4))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// weeklyStrengthAdherence
// ---------------------------------------------------------------------------

function day(weekday: Weekday, planKind: PlanKind, templateId: string | null = null): ScheduledDay {
  return {
    id: String(weekday),
    weekday,
    planKind,
    templateId,
    postureRequired: false,
    postureOptional: false,
    cardioMinutesMin: null,
    cardioMinutesMax: null,
    stepsOptional: false,
    updatedAt: T,
  }
}

const DAYS: ScheduledDay[] = [
  day(0, 'strength', TEMPLATE_IDS.lower),
  day(1, 'recovery'),
  day(2, 'strength', TEMPLATE_IDS.upperA),
  day(3, 'zone2'),
  day(4, 'strength', TEMPLATE_IDS.upperB),
  day(5, 'recovery'),
  day(6, 'rest'),
]

interface Bundle {
  session: WorkoutSession
  exerciseSessions: ExerciseSession[]
  sets: SetLog[]
}

/** A session passing the 50% rule (2 of 3 prescribed sets completed). */
function completedBundle(dateKey: DateKey, templateId: string | null): Bundle {
  const session = ws({ dateKey, templateId })
  const e = es({ workoutSessionId: session.id, prescription: { ...PRESCRIPTION, prescribedSets: 3 } })
  return { session, exerciseSessions: [e], sets: workingSets(e, 2) }
}

function adherence(
  weekAnchor: DateKey,
  today: DateKey,
  bundles: Bundle[],
  programStart: DateKey = PROGRAM_START,
) {
  return weeklyStrengthAdherence(
    weekAnchor,
    today,
    programStart,
    DAYS,
    bundles.map((b) => b.session),
    bundles.flatMap((b) => b.exerciseSessions),
    bundles.flatMap((b) => b.sets),
  )
}

describe('weeklyStrengthAdherence (SPEC 24 DEFINITIONS, proration)', () => {
  it('first-week proration: on program-start Sunday the denominator is exactly 1', () => {
    // Program starts Sunday 2026-08-02; week starts Monday, so the week is
    // 07-27..08-02 and only 08-02 is on/after program start and not in the future.
    expect(adherence('2026-08-02', '2026-08-02', [])).toEqual({
      completed: 0,
      scheduled: 1,
      pct: 0,
    })
  })

  it('completing the program-start workout gives 1/1', () => {
    const bundle = completedBundle('2026-08-02', TEMPLATE_IDS.lower)
    expect(adherence('2026-08-02', '2026-08-02', [bundle])).toEqual({
      completed: 1,
      scheduled: 1,
      pct: 1,
    })
  })

  it('a full week schedules 3 strength days', () => {
    const bundles = [
      completedBundle('2026-08-04', TEMPLATE_IDS.upperA),
      completedBundle('2026-08-06', TEMPLATE_IDS.upperB),
    ]
    const result = adherence('2026-08-04', '2026-08-09', bundles)
    expect(result.completed).toBe(2)
    expect(result.scheduled).toBe(3) // Tue 08-04, Thu 08-06, Sun 08-09
    expect(result.pct).toBeCloseTo(2 / 3)
  })

  it('mid-week the denominator excludes future scheduled days', () => {
    // Wednesday 2026-08-05: only Tuesday counts; Thursday and Sunday are future.
    const bundles = [completedBundle('2026-08-04', TEMPLATE_IDS.upperA)]
    expect(adherence('2026-08-04', '2026-08-05', bundles)).toEqual({
      completed: 1,
      scheduled: 1,
      pct: 1,
    })
  })

  it('pct is null when nothing is scheduled in the countable window', () => {
    // Week fully before the program start.
    expect(adherence('2026-07-20', '2026-08-02', [])).toEqual({
      completed: 0,
      scheduled: 0,
      pct: null,
    })
  })

  it('a finished session below the 50% set rule does not count as completed', () => {
    const session = ws({ dateKey: '2026-08-02', templateId: TEMPLATE_IDS.lower })
    const e = es({ workoutSessionId: session.id }) // 4 prescribed
    const bundle: Bundle = { session, exerciseSessions: [e], sets: workingSets(e, 1) }
    expect(adherence('2026-08-02', '2026-08-02', [bundle])).toEqual({
      completed: 0,
      scheduled: 1,
      pct: 0,
    })
  })

  it('a workout completed on a non-scheduled day still counts in that week', () => {
    // Missed Tuesday, completed Upper A on Wednesday instead.
    const bundles = [completedBundle('2026-08-05', TEMPLATE_IDS.upperA)]
    const result = adherence('2026-08-04', '2026-08-09', bundles)
    expect(result.completed).toBe(1)
    expect(result.scheduled).toBe(3)
  })

  it('sessions dated outside the week are ignored', () => {
    const bundles = [completedBundle('2026-08-02', TEMPLATE_IDS.lower)] // previous week
    const result = adherence('2026-08-04', '2026-08-09', bundles)
    expect(result.completed).toBe(0)
  })

  it('supports a Sunday week start', () => {
    // Sunday-start week 08-02..08-08 contains Sun, Tue, Thu; today 08-04 counts Sun+Tue.
    const bundles = [completedBundle('2026-08-02', TEMPLATE_IDS.lower)]
    const result = weeklyStrengthAdherence(
      '2026-08-04',
      '2026-08-04',
      PROGRAM_START,
      DAYS,
      bundles.map((b) => b.session),
      bundles.flatMap((b) => b.exerciseSessions),
      bundles.flatMap((b) => b.sets),
      0,
    )
    expect(result).toEqual({ completed: 1, scheduled: 2, pct: 0.5 })
  })
})
