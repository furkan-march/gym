import { nowIso } from '../../../lib/ids'
import { EX, OHP_VARIANTS, TEMPLATE_IDS } from '../../../lib/seed/seed'
import type { ScheduledDay, TemplateExercise, WorkoutTemplate } from '../../../lib/types'

/**
 * Verbatim copy of the default PROGRAM rows (templates, template exercises,
 * weekly schedule) from src/lib/seed/seed.ts.
 *
 * KEEP IN SYNC WITH seed.ts. seedDefaults() no-ops once a user profile exists,
 * so "Restore defaults" on the Plan screen rebuilds the same rows from this
 * copy instead. Plan.test.tsx compares this module's output against a fresh
 * seedDefaults() run to catch any drift between the two.
 *
 * Ids are imported from seed.ts (single source of truth); only the numeric
 * prescription tables are duplicated.
 */

export const DEFAULT_TEMPLATE_ID_LIST: string[] = [
  TEMPLATE_IDS.upperA,
  TEMPLATE_IDS.upperB,
  TEMPLATE_IDS.lower,
]

interface TexSeed {
  id: string
  exerciseId: string
  sets: number
  repMin: number
  repMax: number
  rirMin: number
  rirMax: number
  rest: number
  optional?: boolean
  superset?: string
  alternatives?: string[]
  ramp?: { pct: number; reps: number }[]
  defaultVariantId?: string
}

// SPEC 8 — Upper A (Tuesday)
const UPPER_A: TexSeed[] = [
  { id: 'tex-ua-1', exerciseId: EX.benchPress, sets: 4, repMin: 6, repMax: 8, rirMin: 1, rirMax: 2, rest: 150, ramp: [{ pct: 0.4, reps: 8 }, { pct: 0.6, reps: 5 }, { pct: 0.8, reps: 3 }] },
  { id: 'tex-ua-2', exerciseId: EX.pullUp, sets: 4, repMin: 6, repMax: 10, rirMin: 1, rirMax: 2, rest: 150, ramp: [{ pct: 0, reps: 5 }] },
  { id: 'tex-ua-3', exerciseId: EX.inclineDbPress, sets: 3, repMin: 8, repMax: 10, rirMin: 1, rirMax: 2, rest: 120 },
  { id: 'tex-ua-4', exerciseId: EX.chestSupportedRow, sets: 3, repMin: 8, repMax: 10, rirMin: 1, rirMax: 2, rest: 120 },
  { id: 'tex-ua-5', exerciseId: EX.lateralRaise, sets: 3, repMin: 12, repMax: 15, rirMin: 1, rirMax: 2, rest: 70, superset: 'ua-s1' },
  { id: 'tex-ua-6', exerciseId: EX.facePull, sets: 3, repMin: 12, repMax: 15, rirMin: 2, rirMax: 2, rest: 70, superset: 'ua-s1' },
  { id: 'tex-ua-7', exerciseId: EX.ropePushdown, sets: 2, repMin: 10, repMax: 12, rirMin: 1, rirMax: 2, rest: 70, superset: 'ua-s2' },
  { id: 'tex-ua-8', exerciseId: EX.dumbbellCurl, sets: 2, repMin: 10, repMax: 12, rirMin: 1, rirMax: 2, rest: 70, superset: 'ua-s2' },
]

// SPEC 8 — Upper B (Thursday)
const UPPER_B: TexSeed[] = [
  { id: 'tex-ub-1', exerciseId: EX.overheadPress, sets: 4, repMin: 6, repMax: 8, rirMin: 1, rirMax: 2, rest: 150, ramp: [{ pct: 0.5, reps: 8 }, { pct: 0.75, reps: 4 }], defaultVariantId: OHP_VARIANTS.barbell },
  { id: 'tex-ub-2', exerciseId: EX.chestSupportedRow, sets: 4, repMin: 8, repMax: 10, rirMin: 1, rirMax: 2, rest: 120, alternatives: [EX.cableRow] },
  { id: 'tex-ub-3', exerciseId: EX.inclineMachinePress, sets: 3, repMin: 8, repMax: 10, rirMin: 1, rirMax: 2, rest: 120, alternatives: [EX.weightedDip] },
  { id: 'tex-ub-4', exerciseId: EX.latPulldown, sets: 3, repMin: 8, repMax: 10, rirMin: 1, rirMax: 2, rest: 120 },
  { id: 'tex-ub-5', exerciseId: EX.rearDeltFly, sets: 3, repMin: 12, repMax: 15, rirMin: 2, rirMax: 2, rest: 70, superset: 'ub-s1' },
  { id: 'tex-ub-6', exerciseId: EX.cableYRaise, sets: 3, repMin: 12, repMax: 15, rirMin: 2, rirMax: 2, rest: 70, superset: 'ub-s1' },
  { id: 'tex-ub-7', exerciseId: EX.hammerCurl, sets: 2, repMin: 10, repMax: 12, rirMin: 1, rirMax: 2, rest: 70, superset: 'ub-s2' },
  { id: 'tex-ub-8', exerciseId: EX.overheadRopeExt, sets: 2, repMin: 10, repMax: 12, rirMin: 1, rirMax: 2, rest: 70, superset: 'ub-s2' },
]

// SPEC 8 — Lower / Legs (Sunday)
const LOWER: TexSeed[] = [
  { id: 'tex-lo-1', exerciseId: EX.squat, sets: 4, repMin: 6, repMax: 8, rirMin: 1, rirMax: 2, rest: 180, alternatives: [EX.hackSquat, EX.legPress, EX.boxSquat, EX.gobletSquat], ramp: [{ pct: 0.4, reps: 8 }, { pct: 0.6, reps: 5 }, { pct: 0.8, reps: 3 }] },
  { id: 'tex-lo-2', exerciseId: EX.romanianDeadlift, sets: 3, repMin: 6, repMax: 8, rirMin: 1, rirMax: 2, rest: 150, ramp: [{ pct: 0.6, reps: 6 }] },
  { id: 'tex-lo-3', exerciseId: EX.bulgarianSplitSquat, sets: 2, repMin: 8, repMax: 10, rirMin: 2, rirMax: 3, rest: 105, alternatives: [EX.reverseLunge, EX.stepUp, EX.singleLegPress] },
  { id: 'tex-lo-4', exerciseId: EX.legCurl, sets: 3, repMin: 10, repMax: 12, rirMin: 1, rirMax: 2, rest: 80 },
  { id: 'tex-lo-5', exerciseId: EX.standingCalfRaise, sets: 3, repMin: 10, repMax: 15, rirMin: 1, rirMax: 2, rest: 70, superset: 'lo-s1' },
  { id: 'tex-lo-6', exerciseId: EX.pallofPress, sets: 3, repMin: 10, repMax: 12, rirMin: 2, rirMax: 2, rest: 50, optional: true, superset: 'lo-s1' },
  { id: 'tex-lo-7', exerciseId: EX.hangingKneeRaise, sets: 3, repMin: 10, repMax: 15, rirMin: 1, rirMax: 2, rest: 60, optional: true, alternatives: [EX.hangingLegRaise] },
]

export interface DefaultProgram {
  templates: WorkoutTemplate[]
  templateExercises: TemplateExercise[]
  scheduledDays: ScheduledDay[]
}

export function buildDefaultProgram(): DefaultProgram {
  const t = nowIso()

  const templates: WorkoutTemplate[] = [
    { id: TEMPLATE_IDS.upperA, name: 'Upper A', kind: 'upperA', isDefault: true, orderIndex: 0, createdAt: t, updatedAt: t },
    { id: TEMPLATE_IDS.upperB, name: 'Upper B', kind: 'upperB', isDefault: true, orderIndex: 1, createdAt: t, updatedAt: t },
    { id: TEMPLATE_IDS.lower, name: 'Lower / Legs', kind: 'lower', isDefault: true, orderIndex: 2, createdAt: t, updatedAt: t },
  ]

  const toTex = (templateId: string, seeds: TexSeed[]): TemplateExercise[] =>
    seeds.map((s, i) => ({
      id: s.id,
      templateId,
      exerciseId: s.exerciseId,
      defaultVariantId: s.defaultVariantId ?? null,
      orderIndex: i,
      prescribedSets: s.sets,
      repRangeMin: s.repMin,
      repRangeMax: s.repMax,
      targetRIRMin: s.rirMin,
      targetRIRMax: s.rirMax,
      restSeconds: s.rest,
      incrementKg: null,
      isOptional: s.optional ?? false,
      supersetGroup: s.superset ?? null,
      alternativeExerciseIds: s.alternatives ?? [],
      rampScheme: s.ramp ?? [],
      createdAt: t,
      updatedAt: t,
    }))

  const templateExercises = [
    ...toTex(TEMPLATE_IDS.upperA, UPPER_A),
    ...toTex(TEMPLATE_IDS.upperB, UPPER_B),
    ...toTex(TEMPLATE_IDS.lower, LOWER),
  ]

  // SPEC 5 — default weekly schedule; week starts Monday, Legs on Sunday
  const day = (
    weekday: ScheduledDay['weekday'],
    planKind: ScheduledDay['planKind'],
    opts: Partial<ScheduledDay> = {},
  ): ScheduledDay => ({
    id: String(weekday),
    weekday,
    planKind,
    templateId: null,
    postureRequired: false,
    postureOptional: false,
    cardioMinutesMin: null,
    cardioMinutesMax: null,
    stepsOptional: false,
    updatedAt: t,
    ...opts,
  })

  const scheduledDays: ScheduledDay[] = [
    day(0, 'strength', { templateId: TEMPLATE_IDS.lower }),
    day(1, 'recovery', { postureRequired: true }),
    day(2, 'strength', { templateId: TEMPLATE_IDS.upperA }),
    day(3, 'zone2', { postureOptional: true, cardioMinutesMin: 30, cardioMinutesMax: 40 }),
    day(4, 'strength', { templateId: TEMPLATE_IDS.upperB }),
    day(5, 'recovery', { postureRequired: true }),
    day(6, 'rest', { stepsOptional: true, postureOptional: true }),
  ]

  return { templates, templateExercises, scheduledDays }
}
