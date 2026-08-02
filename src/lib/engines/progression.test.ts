import type {
  BodyweightMode,
  Exercise,
  ExerciseSession,
  JointDiscomfort,
  PrescriptionSnapshot,
  SessionFeedback,
  SetLog,
  Side,
  TemplateExercise,
  WorkoutSession,
  WorkoutSessionStatus,
} from '../types'
import {
  comparableHistory,
  detectStall,
  recommend,
  type ComparableSessionInput,
  type RecommendationInput,
} from './progression'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const T = '2026-07-01T10:00:00.000Z'

function ex(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex-1',
    name: 'Bench Press',
    kind: 'weighted',
    unilateral: false,
    loadConvention: null,
    defaultIncrementKg: 2.5,
    createdAt: T,
    updatedAt: T,
    ...over,
  }
}

function rx(over: Partial<PrescriptionSnapshot> = {}): PrescriptionSnapshot {
  return {
    prescribedSets: 3,
    repRangeMin: 8,
    repRangeMax: 10,
    targetRIRMin: 1,
    targetRIRMax: 3,
    restSeconds: 150,
    incrementKg: 2.5,
    isOptional: false,
    supersetGroup: null,
    ...over,
  }
}

function tex(over: Partial<TemplateExercise> = {}): TemplateExercise {
  return {
    id: 'te-1',
    templateId: 'tpl',
    exerciseId: 'ex-1',
    defaultVariantId: null,
    orderIndex: 0,
    prescribedSets: 3,
    repRangeMin: 8,
    repRangeMax: 10,
    targetRIRMin: 1,
    targetRIRMax: 3,
    restSeconds: 150,
    incrementKg: null,
    isOptional: false,
    supersetGroup: null,
    alternativeExerciseIds: [],
    rampScheme: [],
    createdAt: T,
    updatedAt: T,
    ...over,
  }
}

interface SetSpec {
  load?: number | null
  reps: number
  rir?: number | null
  completed?: boolean
  warmup?: boolean
  side?: Side
  mode?: BodyweightMode
  added?: number | null
  assist?: number | null
  pain?: boolean
  poorForm?: boolean
  convention?: 'perDumbbell' | 'combined'
}

interface EntrySpec {
  id?: string
  sets: SetSpec[]
  prescription?: PrescriptionSnapshot
  variantId?: string | null
  contextId?: string | null
  bodyweight?: number | null
  discomfort?: JointDiscomfort
  sessionStatus?: WorkoutSessionStatus
}

let seq = 0

function entry(spec: EntrySpec): ComparableSessionInput {
  seq += 1
  const id = spec.id ?? `session-${seq}`
  const session: WorkoutSession = {
    id,
    templateId: 'tpl',
    templateName: 'Upper A',
    templateKind: 'upperA',
    dateKey: '2026-07-01',
    startedAt: T,
    finishedAt: T,
    status: spec.sessionStatus ?? 'completed',
    bodyweightAtSessionKg: spec.bodyweight === undefined ? 80 : spec.bodyweight,
    activeSeconds: 3600,
    lastActivatedAt: null,
    createdAt: T,
    updatedAt: T,
  }
  const exerciseSession: ExerciseSession = {
    id: `${id}-ex`,
    workoutSessionId: id,
    exerciseId: 'ex-1',
    variantId: spec.variantId === undefined ? null : spec.variantId,
    equipmentContextId: spec.contextId === undefined ? null : spec.contextId,
    exerciseName: 'Bench Press',
    variantName: null,
    status: 'completed',
    orderIndex: 0,
    isUnplanned: false,
    substitutedByExerciseSessionId: null,
    substitutedFromExerciseSessionId: null,
    prescription: spec.prescription ?? rx(),
    createdAt: T,
    updatedAt: T,
  }
  const sets: SetLog[] = spec.sets.map((s, i) => ({
    id: `${id}-set-${i}`,
    workoutSessionId: id,
    exerciseSessionId: exerciseSession.id,
    exerciseId: 'ex-1',
    variantId: exerciseSession.variantId,
    equipmentContextId: exerciseSession.equipmentContextId,
    loadKg: s.load !== undefined ? s.load : s.mode && s.mode !== 'none' ? null : 80,
    reps: s.reps,
    rir: s.rir === undefined ? null : s.rir,
    completed: s.completed ?? true,
    isWarmup: s.warmup ?? false,
    side: s.side ?? null,
    bodyweightMode: s.mode ?? 'none',
    addedWeightKg: s.added ?? null,
    assistanceWeightKg: s.assist ?? null,
    loadConvention: s.convention ?? null,
    orderIndex: i,
    completedAt: T,
    formQuality: s.poorForm ? 'poor' : null,
    painFlag: s.pain ?? false,
    createdAt: T,
    updatedAt: T,
  }))
  const feedback: SessionFeedback | null =
    spec.discomfort === undefined
      ? null
      : {
          id: `${id}-fb`,
          workoutSessionId: id,
          difficulty: 3,
          jointDiscomfort: spec.discomfort,
          kneeComfortAfter: null,
          createdAt: T,
          updatedAt: T,
        }
  return { session, exerciseSession, sets, feedback }
}

function straightSets(load: number | null, reps: number[], rir: number | null = 2): SetSpec[] {
  return reps.map((r) => ({ load, reps: r, rir }))
}

function sideSets(
  load: number,
  left: number[],
  right: number[],
  rir: number | null = 2,
): SetSpec[] {
  return [
    ...left.map((r): SetSpec => ({ load, reps: r, rir, side: 'left' })),
    ...right.map((r): SetSpec => ({ load, reps: r, rir, side: 'right' })),
  ]
}

function bwSets(reps: number[], over: Partial<SetSpec> = {}): SetSpec[] {
  return reps.map((r) => ({ reps: r, rir: 2, mode: 'bodyweight' as BodyweightMode, ...over }))
}

function makeInput(
  history: ComparableSessionInput[],
  over: Partial<RecommendationInput> = {},
): RecommendationInput {
  return {
    exercise: ex(),
    templateExercise: null,
    currentPrescription: rx(),
    history,
    variantId: null,
    equipmentContextId: null,
    ...over,
  }
}

// ---------------------------------------------------------------------------
// Double progression (SPEC 14, SPEC 35 PROGRESSION)
// ---------------------------------------------------------------------------

describe('recommend: double progression', () => {
  it('recommends a load increase after all sets reach the top of the range', () => {
    const base = entry({ id: 's1', sets: straightSets(80, [10, 10, 10], 2) })
    const rec = recommend(makeInput([base]))
    expect(rec.kind).toBe('increase')
    expect(rec.suggestedLoadKg).toBe(82.5)
    expect(rec.perSide).toBe(false)
    expect(rec.repTarget).toBe('aim for 3 sets of 8+')
    expect(rec.sourceSessionId).toBe('s1')
    expect(rec.explanation).toContain('82.5')
    expect(rec.explanation).toContain('10, 10, 10')
  })

  it('recommends keeping the load and adding total reps below the top of the range', () => {
    const base = entry({ sets: straightSets(80, [8, 8, 7], 2) })
    const rec = recommend(makeInput([base]))
    expect(rec.kind).toBe('maintain')
    expect(rec.suggestedLoadKg).toBe(80)
    expect(rec.explanation).toContain('Last time: 80 kg for 8, 8, 7')
    expect(rec.explanation).toContain('Keep 80 kg and aim for at least 24 total reps')
    expect(rec.reasons).toContain('below-top-of-range')
  })

  it('does not recommend an increase after incomplete sets, but keeps the partial session as baseline', () => {
    const base = entry({ id: 'partial', sets: straightSets(80, [10, 10], 2) })
    const rec = recommend(makeInput([base]))
    expect(rec.kind).toBe('maintain')
    expect(rec.reasons).toContain('incomplete-sets')
    expect(rec.explanation).toContain('fewer than the planned working sets')
    expect(rec.sourceSessionId).toBe('partial')
  })

  it('treats a logged-but-uncompleted set as not counting toward the prescription', () => {
    const base = entry({
      sets: [...straightSets(80, [10, 10], 2), { load: 80, reps: 4, rir: 0, completed: false }],
    })
    const rec = recommend(makeInput([base]))
    expect(rec.kind).toBe('maintain')
    expect(rec.reasons).toContain('incomplete-sets')
  })

  it('blocks the increase when the explicit average RIR is 0', () => {
    const base = entry({ sets: straightSets(80, [10, 10, 10], 0) })
    const rec = recommend(makeInput([base]))
    expect(rec.kind).toBe('maintain')
    expect(rec.reasons).toContain('avg-rir-below-1')
    expect(rec.suggestedLoadKg).toBe(80)
  })

  it('blocks the increase when the average RIR is between 0 and 1', () => {
    const base = entry({
      sets: [
        { load: 80, reps: 10, rir: 0 },
        { load: 80, reps: 10, rir: 1 },
        { load: 80, reps: 10, rir: 0 },
      ],
    })
    const rec = recommend(makeInput([base]))
    expect(rec.kind).toBe('maintain')
    expect(rec.reasons).toContain('avg-rir-below-1')
  })

  it('never blocks progression because RIR was not logged', () => {
    const base = entry({ sets: straightSets(80, [10, 10, 10], null) })
    const rec = recommend(makeInput([base]))
    expect(rec.kind).toBe('increase')
    expect(rec.suggestedLoadKg).toBe(82.5)
    expect(rec.reasons).toContain('rir-not-logged')
  })

  it('averages only the sets that logged RIR', () => {
    const base = entry({
      sets: [
        { load: 80, reps: 10, rir: null },
        { load: 80, reps: 10, rir: 2 },
        { load: 80, reps: 10, rir: null },
      ],
    })
    expect(recommend(makeInput([base])).kind).toBe('increase')
  })

  it('blocks progression when poor form was logged', () => {
    const base = entry({
      sets: [...straightSets(80, [10, 10], 2), { load: 80, reps: 10, rir: 2, poorForm: true }],
    })
    const rec = recommend(makeInput([base]))
    expect(rec.kind).toBe('blocked')
    expect(rec.reasons).toContain('poor-form')
    expect(rec.suggestedLoadKg).toBeNull()
  })

  it('blocks progression when pain was flagged', () => {
    const base = entry({
      sets: [...straightSets(80, [10, 10], 2), { load: 80, reps: 10, rir: 2, pain: true }],
    })
    const rec = recommend(makeInput([base]))
    expect(rec.kind).toBe('blocked')
    expect(rec.reasons).toContain('pain-flagged')
    expect(rec.explanation).toContain('Pain was logged during the previous session')
  })

  it('blocks on a pain flag even when it sits on an extra set beyond the prescription', () => {
    const base = entry({
      sets: [...straightSets(80, [10, 10, 10], 2), { load: 80, reps: 10, rir: 2, pain: true }],
    })
    expect(recommend(makeInput([base])).kind).toBe('blocked')
  })

  it('ignores warm-up sets entirely', () => {
    const base = entry({
      sets: [{ load: 60, reps: 5, warmup: true }, ...straightSets(80, [10, 10, 10], 2)],
    })
    const rec = recommend(makeInput([base]))
    expect(rec.kind).toBe('increase')
    expect(rec.suggestedLoadKg).toBe(82.5)
  })

  it('does not let a warm-up set count toward the prescribed working sets', () => {
    const base = entry({
      sets: [{ load: 60, reps: 10, warmup: true }, ...straightSets(80, [10, 10], 2)],
    })
    const rec = recommend(makeInput([base]))
    expect(rec.kind).toBe('maintain')
    expect(rec.reasons).toContain('incomplete-sets')
  })

  it('extra sets neither satisfy nor block the increase condition', () => {
    const withBadExtra = entry({ sets: straightSets(80, [10, 10, 10, 6], 2) })
    expect(recommend(makeInput([withBadExtra])).kind).toBe('increase')

    const withGoodExtra = entry({ sets: straightSets(80, [10, 10, 8, 10], 2) })
    const rec = recommend(makeInput([withGoodExtra]))
    expect(rec.kind).toBe('maintain')
    expect(rec.reasons).toContain('below-top-of-range')
  })

  it('evaluates a compared session against its own prescription snapshot, not the current template', () => {
    // Session was performed under 3x8-10 and mastered it; template has since
    // been edited to 4x8-12. The old session still earns the increase.
    const base = entry({ sets: straightSets(80, [10, 10, 10], 2), prescription: rx() })
    const rec = recommend(
      makeInput([base], { currentPrescription: rx({ prescribedSets: 4, repRangeMax: 12 }) }),
    )
    expect(rec.kind).toBe('increase')
    // ...while the NEXT session's target uses the current prescription.
    expect(rec.repTarget).toBe('aim for 4 sets of 8+')
  })

  it('uses templateExercise.incrementKg over the exercise default, falling back on null', () => {
    const base = () => entry({ sets: straightSets(80, [10, 10, 10], 2) })
    const withOverride = recommend(
      makeInput([base()], { templateExercise: tex({ incrementKg: 5 }) }),
    )
    expect(withOverride.suggestedLoadKg).toBe(85)
    const withFallback = recommend(
      makeInput([base()], { templateExercise: tex({ incrementKg: null }) }),
    )
    expect(withFallback.suggestedLoadKg).toBe(82.5)
  })

  it('rounds the suggested load to the increment', () => {
    const base = entry({ sets: straightSets(81, [10, 10, 10], 2) })
    const rec = recommend(makeInput([base]))
    expect(rec.suggestedLoadKg).toBe(82.5) // 83.5 rounds to the nearest 2.5 step
  })

  it('labels per-dumbbell loads in the explanation', () => {
    const base = entry({
      sets: straightSets(30, [10, 10, 10], 2).map((s) => ({
        ...s,
        convention: 'perDumbbell' as const,
      })),
    })
    const rec = recommend(makeInput([base], { exercise: ex({ defaultIncrementKg: 2 }) }))
    expect(rec.suggestedLoadKg).toBe(32)
    expect(rec.explanation).toContain('32 kg per dumbbell')
  })
})

// ---------------------------------------------------------------------------
// Session feedback suppression (SPEC 17)
// ---------------------------------------------------------------------------

describe('recommend: joint discomfort', () => {
  it('suppresses recommendations after moderate joint discomfort', () => {
    const base = entry({ sets: straightSets(80, [10, 10, 10], 2), discomfort: 'moderate' })
    const rec = recommend(makeInput([base]))
    expect(rec.kind).toBe('blocked')
    expect(rec.reasons).toContain('joint-discomfort-moderate')
    expect(rec.explanation).toMatch(/range of motion, load, technique/)
  })

  it('suppresses recommendations after severe joint discomfort', () => {
    const base = entry({ sets: straightSets(80, [8, 8, 8], 2), discomfort: 'severe' })
    expect(recommend(makeInput([base])).kind).toBe('blocked')
  })

  it('does not suppress after mild or no discomfort', () => {
    const mild = entry({ sets: straightSets(80, [10, 10, 10], 2), discomfort: 'mild' })
    expect(recommend(makeInput([mild])).kind).toBe('increase')
    const none = entry({ sets: straightSets(80, [10, 10, 10], 2), discomfort: 'none' })
    expect(recommend(makeInput([none])).kind).toBe('increase')
  })
})

// ---------------------------------------------------------------------------
// Comparability (SPEC 14 RULE CLARIFICATIONS, SPEC 16)
// ---------------------------------------------------------------------------

describe('recommend: comparability', () => {
  it('returns firstSession when there is no history', () => {
    const rec = recommend(makeInput([]))
    expect(rec.kind).toBe('firstSession')
    expect(rec.sourceSessionId).toBeNull()
    expect(rec.suggestedLoadKg).toBeNull()
    expect(rec.repTarget).toBe('aim for 3 sets of 8-10')
    expect(rec.contentHash).toBeTruthy()
  })

  it('does not compare incomparable variants', () => {
    const other = entry({ sets: straightSets(80, [10, 10, 10], 2), variantId: 'variant-close-grip' })
    const rec = recommend(makeInput([other], { variantId: null }))
    expect(rec.kind).toBe('firstSession')
  })

  it('does not compare different machine contexts when both are recorded', () => {
    const otherMachine = entry({ sets: straightSets(60, [10, 10, 10], 2), contextId: 'ctx-gym-b' })
    const rec = recommend(makeInput([otherMachine], { equipmentContextId: 'ctx-gym-a' }))
    expect(rec.kind).toBe('firstSession')
  })

  it('treats a session with no recorded context as comparable to any context', () => {
    const noCtx = entry({ sets: straightSets(60, [10, 10, 10], 2), contextId: null })
    const rec = recommend(makeInput([noCtx], { equipmentContextId: 'ctx-gym-a' }))
    expect(rec.kind).toBe('increase')
  })

  it('treats any historical context as comparable when the current session has none', () => {
    const withCtx = entry({ sets: straightSets(60, [10, 10, 10], 2), contextId: 'ctx-gym-b' })
    const rec = recommend(makeInput([withCtx], { equipmentContextId: null }))
    expect(rec.kind).toBe('increase')
  })

  it('ignores non-completed workout sessions', () => {
    const active = entry({ sets: straightSets(80, [10, 10, 10], 2), sessionStatus: 'active' })
    const discarded = entry({ sets: straightSets(80, [10, 10, 10], 2), sessionStatus: 'discarded' })
    expect(recommend(makeInput([active, discarded])).kind).toBe('firstSession')
  })

  it('filters bodyweight history to the mode of the most recent comparable session', () => {
    const added = entry({
      sets: bwSets([10, 10, 10], { mode: 'added', added: 5 }),
    })
    const plainBw = entry({ sets: bwSets([12, 12, 12]) })
    const input = makeInput([added, plainBw], { exercise: ex({ kind: 'bodyweight' }) })
    expect(comparableHistory(input)).toHaveLength(1)
    const rec = recommend(input)
    expect(rec.kind).toBe('increase')
    expect(rec.suggestedLoadKg).toBe(7.5) // progressed from the 'added' baseline, not the bw one
  })
})

// ---------------------------------------------------------------------------
// Unilateral exercises (SPEC 14 rule 9 + clarifications)
// ---------------------------------------------------------------------------

describe('recommend: unilateral', () => {
  const uniInput = (history: ComparableSessionInput[]) =>
    makeInput(history, {
      exercise: ex({ id: 'ex-bss', name: 'Bulgarian Split Squat', unilateral: true }),
      currentPrescription: rx({ prescribedSets: 2 }),
    })
  const uniRx = rx({ prescribedSets: 2 })

  it('recommends an increase only when both sides qualify, applied per side', () => {
    const base = entry({ sets: sideSets(20, [10, 10], [10, 10]), prescription: uniRx })
    const rec = recommend(uniInput([base]))
    expect(rec.kind).toBe('increase')
    expect(rec.perSide).toBe(true)
    expect(rec.suggestedLoadKg).toBe(22.5)
    expect(rec.explanation).toContain('per side')
  })

  it('maintains and names the limiting side when only one side qualifies', () => {
    const base = entry({ sets: sideSets(20, [10, 10], [10, 8]), prescription: uniRx })
    const rec = recommend(uniInput([base]))
    expect(rec.kind).toBe('maintain')
    expect(rec.reasons).toContain('right-side-limiting')
    expect(rec.explanation).toContain('right side is limiting')
  })

  it('counts a set only toward its own side', () => {
    // Right side logged just one of its two prescribed sets.
    const base = entry({ sets: sideSets(20, [10, 10], [10]), prescription: uniRx })
    const rec = recommend(uniInput([base]))
    expect(rec.kind).toBe('maintain')
    expect(rec.reasons).toContain('right-side-limiting')
  })
})

// ---------------------------------------------------------------------------
// Rep-only exercises (SPEC 14 generalization)
// ---------------------------------------------------------------------------

describe('recommend: repsOnly', () => {
  const repsInput = (history: ComparableSessionInput[]) =>
    makeInput(history, {
      exercise: ex({ id: 'ex-hkr', name: 'Hanging Knee Raise', kind: 'repsOnly' }),
      currentPrescription: rx({ repRangeMin: 10, repRangeMax: 15 }),
    })
  const repsRx = rx({ repRangeMin: 10, repRangeMax: 15 })

  it('recommends 1-2 more total reps below the top of the range, with no load math', () => {
    const base = entry({ sets: straightSets(null, [12, 12, 10], null), prescription: repsRx })
    const rec = recommend(repsInput([base]))
    expect(rec.kind).toBe('maintain')
    expect(rec.suggestedLoadKg).toBeNull()
    expect(rec.repTarget).toContain('35 total reps')
    expect(rec.explanation).toContain('Add 1-2 total reps')
  })

  it('suggests a harder variant once all sets reach the top of the range', () => {
    const base = entry({ sets: straightSets(null, [15, 15, 15], null), prescription: repsRx })
    const rec = recommend(repsInput([base]))
    expect(rec.kind).toBe('increase')
    expect(rec.suggestedLoadKg).toBeNull()
    expect(rec.explanation).toContain('harder variant')
  })
})

// ---------------------------------------------------------------------------
// Bodyweight modes (SPEC 15, SPEC 35 BODYWEIGHT)
// ---------------------------------------------------------------------------

describe('recommend: bodyweight modes', () => {
  const bwInput = (history: ComparableSessionInput[]) =>
    makeInput(history, { exercise: ex({ id: 'ex-pull-up', name: 'Pull-Up', kind: 'bodyweight' }) })

  it('bodyweight at top of range suggests adding the configured external load', () => {
    const base = entry({ sets: bwSets([10, 10, 10]) })
    const rec = recommend(bwInput([base]))
    expect(rec.kind).toBe('increase')
    expect(rec.suggestedLoadKg).toBe(2.5)
    expect(rec.explanation).toContain('Add 2.5 kg')
    expect(rec.repTarget).toBe('aim for 3 sets of 8+')
  })

  it('bodyweight below the top of the range progresses reps, not load', () => {
    const base = entry({ sets: bwSets([9, 9, 8]) })
    const rec = recommend(bwInput([base]))
    expect(rec.kind).toBe('maintain')
    expect(rec.suggestedLoadKg).toBeNull()
    expect(rec.explanation).toContain('bodyweight')
  })

  it('added mode progresses the external load like a weighted lift', () => {
    const base = entry({ sets: bwSets([10, 10, 10], { mode: 'added', added: 5 }) })
    const rec = recommend(bwInput([base]))
    expect(rec.kind).toBe('increase')
    expect(rec.suggestedLoadKg).toBe(7.5)
    expect(rec.explanation).toContain('bodyweight + 5 kg')
  })

  it('assisted machine at top of range reduces assistance by the increment', () => {
    const base = entry({ sets: bwSets([10, 10, 10], { mode: 'assistedMachine', assist: 25 }) })
    const rec = recommend(bwInput([base]))
    expect(rec.kind).toBe('increase')
    expect(rec.suggestedLoadKg).toBe(22.5)
    expect(rec.explanation).toContain('Reduce assistance to 22.5 kg')
  })

  it('assisted machine transitions to bodyweight when assistance reaches 0', () => {
    const base = entry({ sets: bwSets([10, 10, 10], { mode: 'assistedMachine', assist: 2.5 }) })
    const rec = recommend(bwInput([base]))
    expect(rec.kind).toBe('increase')
    expect(rec.suggestedLoadKg).toBe(0)
    expect(rec.reasons).toContain('transition-to-bodyweight')
    expect(rec.explanation).toContain('bodyweight')
  })

  it('band assistance never yields a numeric load recommendation', () => {
    const top = entry({ sets: bwSets([10, 10, 10], { mode: 'assistedBand' }) })
    const atTop = recommend(bwInput([top]))
    expect(atTop.kind).toBe('increase')
    expect(atTop.suggestedLoadKg).toBeNull()
    expect(atTop.explanation).toContain('lighter band')

    const below = entry({ sets: bwSets([8, 8, 7], { mode: 'assistedBand' }) })
    const belowTop = recommend(bwInput([below]))
    expect(belowTop.kind).toBe('maintain')
    expect(belowTop.suggestedLoadKg).toBeNull()
  })

  it('a bodyweight change alone is not read as a strength change', () => {
    // Same reps at bodyweight while the bodyweight itself drifted down.
    const newer = entry({ sets: bwSets([8, 8, 8]), bodyweight: 78 })
    const older = entry({ sets: bwSets([8, 8, 8]), bodyweight: 82 })
    expect(detectStall([newer, older]).kind).toBe('none')
    const rec = recommend(bwInput([newer, older]))
    expect(rec.kind).toBe('maintain')
  })
})

// ---------------------------------------------------------------------------
// Fatigue and stall (SPEC 14 FATIGUE AND STALL LOGIC)
// ---------------------------------------------------------------------------

describe('detectStall and fatigue kinds', () => {
  it('warns about fatigue after two valid consecutive declines', () => {
    const oldest = entry({ sets: straightSets(80, [10, 10, 9], 2) })
    const middle = entry({ sets: straightSets(80, [9, 9, 9], 2) })
    const newest = entry({ sets: straightSets(80, [9, 8, 8], 2) })
    const history = [newest, middle, oldest]
    const stall = detectStall(history)
    expect(stall.kind).toBe('fatigueNotice')
    expect(stall.explanation).toMatch(/sleep/i)
    expect(stall.explanation).toMatch(/calorie deficit/i)
    expect(stall.explanation).toMatch(/not a diagnosis of overtraining/i)

    const rec = recommend(makeInput(history))
    expect(rec.kind).toBe('fatigue')
    expect(rec.suggestedLoadKg).toBe(80) // suggests maintaining the load
  })

  it('does not warn after a single flat session', () => {
    const older = entry({ sets: straightSets(80, [9, 9, 9], 2) })
    const newer = entry({ sets: straightSets(80, [9, 9, 9], 2) })
    expect(detectStall([newer, older]).kind).toBe('none')
    expect(recommend(makeInput([newer, older])).kind).toBe('maintain')
  })

  it('does not warn after a single decline', () => {
    const older = entry({ sets: straightSets(80, [10, 9, 9], 2) })
    const newer = entry({ sets: straightSets(80, [9, 9, 9], 2) })
    expect(detectStall([newer, older]).kind).toBe('none')
  })

  it('suggests deload options after three stalled or declining sessions', () => {
    const s1 = entry({ sets: straightSets(80, [9, 9, 9], 2) }) // 27
    const s2 = entry({ sets: straightSets(80, [9, 9, 8], 2) }) // 26: decline
    const s3 = entry({ sets: straightSets(80, [9, 9, 8], 2) }) // 26: stall
    const s4 = entry({ sets: straightSets(80, [9, 8, 8], 2) }) // 25: decline
    const history = [s4, s3, s2, s1]
    const stall = detectStall(history)
    expect(stall.kind).toBe('deloadSuggestion')
    expect(stall.explanation).toContain('5-7.5%')
    expect(stall.explanation).toContain('deload week')
    expect(stall.explanation).toMatch(/remove one working set/i)
    expect(stall.explanation).toMatch(/technique/i)
    expect(stall.explanation).toMatch(/substitute/i)
    expect(stall.explanation).toMatch(/sleep/i)

    const rec = recommend(makeInput(history))
    expect(rec.kind).toBe('deload')
    expect(rec.suggestedLoadKg).toBeNull() // options only; nothing applied automatically
  })

  it('never counts the rep reset after a load increase as a decline', () => {
    const before = entry({ sets: straightSets(80, [10, 10, 10], 2) })
    const afterIncrease = entry({ sets: straightSets(82.5, [8, 8, 8], 2) })
    expect(detectStall([afterIncrease, before]).kind).toBe('none')
    const rec = recommend(makeInput([afterIncrease, before]))
    expect(rec.kind).toBe('maintain')
    expect(rec.suggestedLoadKg).toBe(82.5)
  })

  it('a load increase resets the streak even when older declines exist', () => {
    const oldDecline2 = entry({ sets: straightSets(80, [10, 10, 10], 2) })
    const oldDecline1 = entry({ sets: straightSets(80, [9, 9, 9], 2) })
    const increased = entry({ sets: straightSets(82.5, [8, 8, 8], 2) })
    expect(detectStall([increased, oldDecline1, oldDecline2]).kind).toBe('none')
  })

  it('compares sessions at different loads by best-set e1RM, not total reps', () => {
    // The lifter reduced load twice; e1RM keeps falling, so it is a decline
    // even though per-session reps look flat.
    const a = entry({ sets: straightSets(80, [10, 10, 10], 2) }) // best e1RM 106.7
    const b = entry({ sets: straightSets(77.5, [8, 8, 8], 2) }) // 98.2
    const c = entry({ sets: straightSets(75, [8, 8, 8], 2) }) // 95
    expect(detectStall([c, b, a]).kind).toBe('fatigueNotice')
  })

  it('a stall breaks the decline streak but keeps counting toward the deload window', () => {
    const s1 = entry({ sets: straightSets(80, [9, 9, 9], 2) })
    const s2 = entry({ sets: straightSets(80, [9, 9, 9], 2) }) // stall
    const s3 = entry({ sets: straightSets(80, [9, 9, 8], 2) }) // decline
    // Streak from newest: decline(1) then stall -> no two consecutive declines.
    expect(detectStall([s3, s2, s1]).kind).toBe('none')
  })
})

// ---------------------------------------------------------------------------
// Recommendation lifecycle plumbing
// ---------------------------------------------------------------------------

describe('contentHash and sourceSessionId', () => {
  it('is deterministic for identical inputs', () => {
    const build = () =>
      recommend(makeInput([entry({ id: 'stable', sets: straightSets(80, [10, 10, 10], 2) })]))
    expect(build().contentHash).toBe(build().contentHash)
  })

  it('changes when the decision content changes', () => {
    const a = recommend(makeInput([entry({ id: 'a', sets: straightSets(80, [10, 10, 10], 2) })]))
    const b = recommend(makeInput([entry({ id: 'a', sets: straightSets(80, [8, 8, 7], 2) })]))
    expect(a.contentHash).not.toBe(b.contentHash)
  })

  it('points sourceSessionId at the baseline session', () => {
    const older = entry({ id: 'old', sets: straightSets(80, [8, 8, 8], 2) })
    const newer = entry({ id: 'new', sets: straightSets(80, [9, 9, 8], 2) })
    expect(recommend(makeInput([newer, older])).sourceSessionId).toBe('new')
  })
})
