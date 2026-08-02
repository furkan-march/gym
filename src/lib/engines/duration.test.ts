import { describe, expect, it } from 'vitest'
import { elapsedActiveSeconds, estimateSessionMinutes } from './duration'
import type { EstimatorExercise } from './duration'
import type { Exercise, TemplateExercise, WorkoutSession } from '../types'

const T = '2026-08-04T18:00:00.000Z'

function makeExercise(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex-x',
    name: 'Exercise',
    kind: 'weighted',
    unilateral: false,
    loadConvention: null,
    defaultIncrementKg: 2.5,
    createdAt: T,
    updatedAt: T,
    ...over,
  }
}

let texCounter = 0
function makeTex(
  over: Partial<TemplateExercise>,
  exerciseOver: Partial<Exercise> = {},
): EstimatorExercise {
  texCounter += 1
  return {
    id: `tex-${texCounter}`,
    templateId: 'tpl-x',
    exerciseId: `ex-${texCounter}`,
    defaultVariantId: null,
    orderIndex: texCounter,
    prescribedSets: 3,
    repRangeMin: 8,
    repRangeMax: 10,
    targetRIRMin: 1,
    targetRIRMax: 2,
    restSeconds: 120,
    incrementKg: null,
    isOptional: false,
    supersetGroup: null,
    alternativeExerciseIds: [],
    rampScheme: [],
    createdAt: T,
    updatedAt: T,
    ...over,
    exercise: makeExercise({ id: over.exerciseId ?? `ex-${texCounter}`, ...exerciseOver }),
  }
}

describe('estimateSessionMinutes', () => {
  it('single exercise: sets x 40 s + (sets - 1) x rest + 90 s transition + warm-up', () => {
    const bench = makeTex({ prescribedSets: 4, restSeconds: 150 })
    // 4*40 + 3*150 + 90 = 700 s; + 8 min warm-up = 1180 s -> 19.67 -> 20
    expect(
      estimateSessionMinutes({ templateExercises: [bench], warmupMinutes: 8, rampSetsEnabled: false }),
    ).toBe(20)
  })

  it('unilateral: per-side sets count individually, rest applies per round', () => {
    const bss = makeTex({ prescribedSets: 2, restSeconds: 105 }, { unilateral: true })
    // set time 2 sides * 2 sets * 40 = 160; rests = (2 - 1) * 105; + 90 = 355 s -> 6
    expect(
      estimateSessionMinutes({ templateExercises: [bss], warmupMinutes: 0, rampSetsEnabled: false }),
    ).toBe(6)
  })

  it('superset pair forms one combined block with a single rest chain and one transition', () => {
    const calf = makeTex({ prescribedSets: 3, restSeconds: 70, supersetGroup: 'lo-s1' })
    const pallof = makeTex(
      { prescribedSets: 3, restSeconds: 50, supersetGroup: 'lo-s1' },
      { unilateral: true },
    )
    // set time 3*40 + 3*2*40 = 360; rests (3-1)*max(70,50) = 140; + one 90 = 590 s -> 10
    expect(
      estimateSessionMinutes({
        templateExercises: [calf, pallof],
        warmupMinutes: 0,
        rampSetsEnabled: false,
      }),
    ).toBe(10)
  })

  it('ramp sets add 40 s + 60 s short rest each, only when enabled', () => {
    const ramp = [
      { pct: 0.4, reps: 8 },
      { pct: 0.6, reps: 5 },
      { pct: 0.8, reps: 3 },
    ]
    const squat = makeTex({ prescribedSets: 4, restSeconds: 180, rampScheme: ramp })
    const base = { templateExercises: [squat], warmupMinutes: 0 }
    // without ramps: 4*40 + 3*180 + 90 = 790 s -> 13
    expect(estimateSessionMinutes({ ...base, rampSetsEnabled: false })).toBe(13)
    // with ramps: 790 + 3*(40 + 60) = 1090 s -> 18
    expect(estimateSessionMinutes({ ...base, rampSetsEnabled: true })).toBe(18)
  })

  it('hand-checked seeded Lower / Legs shape lands in the 60-70 minute band', () => {
    const lower: EstimatorExercise[] = [
      // Squat: 4 x 40 + 3 x 180 + 3 ramp x 100 + 90 = 1090
      makeTex({
        orderIndex: 0,
        prescribedSets: 4,
        restSeconds: 180,
        rampScheme: [
          { pct: 0.4, reps: 8 },
          { pct: 0.6, reps: 5 },
          { pct: 0.8, reps: 3 },
        ],
      }),
      // RDL: 3 x 40 + 2 x 150 + 1 ramp x 100 + 90 = 610
      makeTex({ orderIndex: 1, prescribedSets: 3, restSeconds: 150, rampScheme: [{ pct: 0.6, reps: 6 }] }),
      // BSS (unilateral): 2*2*40 + 1 x 105 + 90 = 355
      makeTex({ orderIndex: 2, prescribedSets: 2, restSeconds: 105 }, { unilateral: true }),
      // Leg Curl: 3 x 40 + 2 x 80 + 90 = 370
      makeTex({ orderIndex: 3, prescribedSets: 3, restSeconds: 80 }),
      // Calf + Pallof superset: (120 + 240) + 2 x 70 + 90 = 590
      makeTex({ orderIndex: 4, prescribedSets: 3, restSeconds: 70, supersetGroup: 'lo-s1' }),
      makeTex(
        { orderIndex: 5, prescribedSets: 3, restSeconds: 50, supersetGroup: 'lo-s1', isOptional: true },
        { unilateral: true },
      ),
      // Hanging Knee Raise: 3 x 40 + 2 x 60 + 90 = 330
      makeTex({ orderIndex: 6, prescribedSets: 3, restSeconds: 60, isOptional: true }),
    ]
    // Blocks total 3345 s + 8 min warm-up = 3825 s = 63.75 -> 64 minutes
    const minutes = estimateSessionMinutes({
      templateExercises: lower,
      warmupMinutes: 8,
      rampSetsEnabled: true,
    })
    expect(minutes).toBe(64)
    expect(minutes).toBeGreaterThanOrEqual(60)
    expect(minutes).toBeLessThanOrEqual(70)
  })

  it('orders blocks by orderIndex and groups non-adjacent superset members once', () => {
    const a = makeTex({ orderIndex: 2, prescribedSets: 2, restSeconds: 60, supersetGroup: 'g' })
    const b = makeTex({ orderIndex: 0, prescribedSets: 2, restSeconds: 60, supersetGroup: 'g' })
    const c = makeTex({ orderIndex: 1, prescribedSets: 2, restSeconds: 60 })
    // blocks: [b+a] and [c]: (4*40 + 60 + 90) + (2*40 + 60 + 90) = 310 + 230 = 540 -> 9
    expect(
      estimateSessionMinutes({ templateExercises: [a, b, c], warmupMinutes: 0, rampSetsEnabled: false }),
    ).toBe(9)
  })

  it('empty template estimates only the warm-up', () => {
    expect(
      estimateSessionMinutes({ templateExercises: [], warmupMinutes: 8, rampSetsEnabled: true }),
    ).toBe(8)
  })
})

describe('elapsedActiveSeconds', () => {
  const base: WorkoutSession = {
    id: 'ws-1',
    templateId: 'tpl-lower',
    templateName: 'Lower / Legs',
    templateKind: 'lower',
    dateKey: '2026-08-02',
    startedAt: '2026-08-02T17:00:00.000Z',
    finishedAt: null,
    status: 'active',
    bodyweightAtSessionKg: 87,
    activeSeconds: 600,
    lastActivatedAt: '2026-08-02T17:30:00.000Z',
    createdAt: '2026-08-02T17:00:00.000Z',
    updatedAt: '2026-08-02T17:30:00.000Z',
  }

  it('adds the live span since lastActivatedAt while active', () => {
    expect(elapsedActiveSeconds(base, new Date('2026-08-02T17:32:30.000Z'))).toBe(750)
  })

  it('returns the frozen accumulator when the session is saved-and-exited', () => {
    const frozen: WorkoutSession = { ...base, lastActivatedAt: null }
    expect(elapsedActiveSeconds(frozen, new Date('2026-08-02T19:00:00.000Z'))).toBe(600)
  })

  it('ignores lastActivatedAt once the session is no longer active', () => {
    const done: WorkoutSession = { ...base, status: 'completed' }
    expect(elapsedActiveSeconds(done, new Date('2026-08-02T19:00:00.000Z'))).toBe(600)
  })

  it('never subtracts time when now is behind lastActivatedAt (clock skew)', () => {
    expect(elapsedActiveSeconds(base, new Date('2026-08-02T17:29:00.000Z'))).toBe(600)
  })
})
