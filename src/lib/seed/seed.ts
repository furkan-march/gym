import { db } from '../db'
import { nowIso } from '../ids'
import { SUPPLEMENT_SEED } from './supplements'
import type {
  AppSettings,
  Exercise,
  ExerciseVariant,
  MealTemplate,
  PostureRoutineTemplate,
  ScheduledDay,
  TemplateExercise,
  UserProfile,
  WorkoutTemplate,
} from '../types'

/**
 * Default seed data (SPEC 1, 5, 8, 9, 10, 22, 23, 28, 34).
 * Deterministic ids so progression history and tests reference stable keys.
 * No fake completed history is ever seeded (SPEC 5/34).
 */

export const TEMPLATE_IDS = {
  pushA: 'tpl-push-a',
  pullA: 'tpl-pull-a',
  legsA: 'tpl-legs-a',
  pushB: 'tpl-push-b',
  pullB: 'tpl-pull-b',
  legsB: 'tpl-legs-b',
} as const

/** Pre-2026-08-06 default template ids; restore cleans these up. */
export const LEGACY_TEMPLATE_IDS = ['tpl-upper-a', 'tpl-upper-b', 'tpl-lower'] as const

export const EX = {
  benchPress: 'ex-bench-press',
  dbBenchPress: 'ex-db-bench-press',
  pushUp: 'ex-push-up',
  dbRow: 'ex-db-row',
  cableChestPress: 'ex-cable-chest-press',
  cableChestFly: 'ex-cable-chest-fly',
  smithSquat: 'ex-smith-squat',
  smithInclinePress: 'ex-smith-incline-press',
  dbRomanianDeadlift: 'ex-db-romanian-deadlift',
  dbLegCurl: 'ex-db-leg-curl',
  hipThrust: 'ex-hip-thrust',
  lyingLegRaise: 'ex-lying-leg-raise',
  pullUp: 'ex-pull-up',
  inclineDbPress: 'ex-incline-db-press',
  chestSupportedRow: 'ex-chest-supported-row',
  lateralRaise: 'ex-lateral-raise',
  facePull: 'ex-face-pull',
  ropePushdown: 'ex-rope-pushdown',
  dumbbellCurl: 'ex-dumbbell-curl',
  overheadPress: 'ex-overhead-press',
  cableRow: 'ex-cable-row',
  inclineMachinePress: 'ex-incline-machine-press',
  weightedDip: 'ex-weighted-dip',
  latPulldown: 'ex-lat-pulldown',
  rearDeltFly: 'ex-rear-delt-fly',
  cableYRaise: 'ex-cable-y-raise',
  hammerCurl: 'ex-hammer-curl',
  overheadRopeExt: 'ex-overhead-rope-ext',
  squat: 'ex-squat',
  hackSquat: 'ex-hack-squat',
  legPress: 'ex-leg-press',
  boxSquat: 'ex-box-squat',
  gobletSquat: 'ex-goblet-squat',
  romanianDeadlift: 'ex-romanian-deadlift',
  bulgarianSplitSquat: 'ex-bulgarian-split-squat',
  reverseLunge: 'ex-reverse-lunge',
  stepUp: 'ex-step-up',
  singleLegPress: 'ex-single-leg-press',
  legCurl: 'ex-leg-curl',
  standingCalfRaise: 'ex-standing-calf-raise',
  hangingKneeRaise: 'ex-hanging-knee-raise',
  hangingLegRaise: 'ex-hanging-leg-raise',
  pallofPress: 'ex-pallof-press',
} as const

export const OHP_VARIANTS = {
  barbell: 'var-ohp-barbell',
  seatedDumbbell: 'var-ohp-seated-db',
  machine: 'var-ohp-machine',
  landmine: 'var-ohp-landmine',
} as const

interface ExerciseSeed {
  id: string
  name: string
  kind: Exercise['kind']
  unilateral?: boolean
  perDumbbell?: boolean
  incrementKg: number
}

const EXERCISES: ExerciseSeed[] = [
  { id: EX.benchPress, name: 'Bench Press', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.dbBenchPress, name: 'Dumbbell Bench Press', kind: 'weighted', perDumbbell: true, incrementKg: 2 },
  { id: EX.pushUp, name: 'Push-Up', kind: 'bodyweight', incrementKg: 2.5 },
  { id: EX.dbRow, name: 'One-Arm Dumbbell Row', kind: 'weighted', unilateral: true, perDumbbell: true, incrementKg: 2 },
  { id: EX.cableChestPress, name: 'Cable Chest Press', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.cableChestFly, name: 'Cable Chest Fly', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.smithSquat, name: 'Smith Machine Squat', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.smithInclinePress, name: 'Smith Incline Press', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.dbRomanianDeadlift, name: 'Dumbbell Romanian Deadlift', kind: 'weighted', perDumbbell: true, incrementKg: 2 },
  { id: EX.dbLegCurl, name: 'Dumbbell Leg Curl', kind: 'weighted', incrementKg: 2 },
  { id: EX.hipThrust, name: 'Hip Thrust', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.lyingLegRaise, name: 'Lying Leg Raise', kind: 'repsOnly', incrementKg: 0 },
  { id: EX.pullUp, name: 'Pull-Up', kind: 'bodyweight', incrementKg: 2.5 },
  { id: EX.inclineDbPress, name: 'Incline Dumbbell Press', kind: 'weighted', perDumbbell: true, incrementKg: 2 },
  { id: EX.chestSupportedRow, name: 'Chest-Supported Row', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.lateralRaise, name: 'Lateral Raise', kind: 'weighted', perDumbbell: true, incrementKg: 1 },
  { id: EX.facePull, name: 'Face Pull', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.ropePushdown, name: 'Rope Pushdown', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.dumbbellCurl, name: 'Dumbbell Curl', kind: 'weighted', perDumbbell: true, incrementKg: 1 },
  { id: EX.overheadPress, name: 'Overhead Press', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.cableRow, name: 'Cable Row', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.inclineMachinePress, name: 'Incline Machine Press', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.weightedDip, name: 'Weighted Dip', kind: 'bodyweight', incrementKg: 2.5 },
  { id: EX.latPulldown, name: 'Lat Pulldown', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.rearDeltFly, name: 'Rear-Delt Fly', kind: 'weighted', incrementKg: 1 },
  { id: EX.cableYRaise, name: 'Cable Y-Raise', kind: 'weighted', incrementKg: 1 },
  { id: EX.hammerCurl, name: 'Hammer Curl', kind: 'weighted', perDumbbell: true, incrementKg: 1 },
  { id: EX.overheadRopeExt, name: 'Overhead Rope Extension', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.squat, name: 'Squat', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.hackSquat, name: 'Hack Squat', kind: 'weighted', incrementKg: 5 },
  { id: EX.legPress, name: 'Leg Press', kind: 'weighted', incrementKg: 5 },
  { id: EX.boxSquat, name: 'Box Squat', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.gobletSquat, name: 'Goblet Squat', kind: 'weighted', perDumbbell: false, incrementKg: 2 },
  { id: EX.romanianDeadlift, name: 'Romanian Deadlift', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.bulgarianSplitSquat, name: 'Bulgarian Split Squat', kind: 'weighted', unilateral: true, perDumbbell: true, incrementKg: 2 },
  { id: EX.reverseLunge, name: 'Reverse Lunge', kind: 'weighted', unilateral: true, perDumbbell: true, incrementKg: 2 },
  { id: EX.stepUp, name: 'Step-Up', kind: 'weighted', unilateral: true, perDumbbell: true, incrementKg: 2 },
  { id: EX.singleLegPress, name: 'Single-Leg Press', kind: 'weighted', unilateral: true, incrementKg: 5 },
  { id: EX.legCurl, name: 'Leg Curl', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.standingCalfRaise, name: 'Standing Calf Raise', kind: 'weighted', incrementKg: 2.5 },
  { id: EX.hangingKneeRaise, name: 'Hanging Knee Raise', kind: 'repsOnly', incrementKg: 0 },
  { id: EX.hangingLegRaise, name: 'Hanging Leg Raise', kind: 'repsOnly', incrementKg: 0 },
  { id: EX.pallofPress, name: 'Pallof Press', kind: 'weighted', unilateral: true, incrementKg: 1 },
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

// REVISION 2026-08-06 (Furkan's request): 6-morning system — 20 min cardio +
// ~30 min lifting, Push/Pull/Legs A-B across Mon-Sat, Sunday full rest.
// Strength-skewed rep ranges (athletic density, not bulk); building-gym
// equipment only. Kind mapping: push→'upperA', pull→'upperB', legs→'lower'
// (drives warm-up lists, knee flows, and the Legs heading).
// REVISION 2026-08-18 (matched to how Furkan actually trains): antagonist-arm
// split — triceps on Pull days, biceps on Push days; EVERY exercise is 2
// working sets (add a 3rd via Plan when a lift stalls). Week order follows his
// real rhythm: Mon Pull A, Tue Push A, Wed Legs A, Thu Pull B, Fri Push B,
// Sat Legs B, Sun rest.
const PULL_A: TexSeed[] = [
  { id: 'tex-la-1', exerciseId: EX.pullUp, sets: 2, repMin: 5, repMax: 8, rirMin: 2, rirMax: 2, rest: 150, alternatives: [EX.latPulldown], ramp: [{ pct: 0, reps: 5 }] },
  { id: 'tex-la-2', exerciseId: EX.dbRow, sets: 2, repMin: 8, repMax: 10, rirMin: 2, rirMax: 2, rest: 105, alternatives: [EX.cableRow, EX.chestSupportedRow] },
  { id: 'tex-la-3', exerciseId: EX.ropePushdown, sets: 2, repMin: 10, repMax: 12, rirMin: 1, rirMax: 2, rest: 60, superset: 'la-s1' },
  { id: 'tex-la-4', exerciseId: EX.lateralRaise, sets: 2, repMin: 12, repMax: 15, rirMin: 1, rirMax: 2, rest: 60, superset: 'la-s1' },
]

const PUSH_A: TexSeed[] = [
  { id: 'tex-pa-1', exerciseId: EX.pushUp, sets: 2, repMin: 8, repMax: 15, rirMin: 2, rirMax: 2, rest: 90 },
  { id: 'tex-pa-2', exerciseId: EX.overheadPress, sets: 2, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, rest: 120, defaultVariantId: OHP_VARIANTS.seatedDumbbell },
  { id: 'tex-pa-3', exerciseId: EX.cableChestPress, sets: 2, repMin: 8, repMax: 10, rirMin: 2, rirMax: 2, rest: 105, alternatives: [EX.cableChestFly, EX.dbBenchPress] },
  { id: 'tex-pa-4', exerciseId: EX.dumbbellCurl, sets: 2, repMin: 10, repMax: 12, rirMin: 1, rirMax: 2, rest: 60, superset: 'pa-s1' },
  { id: 'tex-pa-5', exerciseId: EX.lateralRaise, sets: 2, repMin: 12, repMax: 15, rirMin: 1, rirMax: 2, rest: 60, superset: 'pa-s1' },
]

const LEGS_A: TexSeed[] = [
  { id: 'tex-ga-1', exerciseId: EX.smithSquat, sets: 2, repMin: 5, repMax: 7, rirMin: 2, rirMax: 2, rest: 180, alternatives: [EX.gobletSquat, EX.squat, EX.boxSquat], ramp: [{ pct: 0.4, reps: 8 }, { pct: 0.6, reps: 5 }, { pct: 0.8, reps: 3 }] },
  { id: 'tex-ga-2', exerciseId: EX.dbRomanianDeadlift, sets: 2, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, rest: 150, alternatives: [EX.romanianDeadlift], ramp: [{ pct: 0.6, reps: 6 }] },
  { id: 'tex-ga-3', exerciseId: EX.standingCalfRaise, sets: 2, repMin: 10, repMax: 15, rirMin: 1, rirMax: 2, rest: 60 },
]

const PULL_B: TexSeed[] = [
  { id: 'tex-lb-1', exerciseId: EX.latPulldown, sets: 2, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, rest: 120 },
  { id: 'tex-lb-2', exerciseId: EX.chestSupportedRow, sets: 2, repMin: 6, repMax: 8, rirMin: 2, rirMax: 2, rest: 120, alternatives: [EX.cableRow] },
  { id: 'tex-lb-3', exerciseId: EX.facePull, sets: 2, repMin: 12, repMax: 15, rirMin: 2, rirMax: 2, rest: 60, superset: 'lb-s1' },
  { id: 'tex-lb-4', exerciseId: EX.overheadRopeExt, sets: 2, repMin: 10, repMax: 12, rirMin: 1, rirMax: 2, rest: 60, superset: 'lb-s1' },
]

const PUSH_B: TexSeed[] = [
  { id: 'tex-pb-1', exerciseId: EX.dbBenchPress, sets: 2, repMin: 5, repMax: 7, rirMin: 2, rirMax: 2, rest: 150, alternatives: [EX.smithInclinePress, EX.weightedDip], ramp: [{ pct: 0.4, reps: 8 }, { pct: 0.6, reps: 5 }, { pct: 0.8, reps: 3 }] },
  { id: 'tex-pb-2', exerciseId: EX.cableChestFly, sets: 2, repMin: 10, repMax: 12, rirMin: 1, rirMax: 2, rest: 75, alternatives: [EX.smithInclinePress] },
  { id: 'tex-pb-3', exerciseId: EX.hammerCurl, sets: 2, repMin: 10, repMax: 12, rirMin: 1, rirMax: 2, rest: 60, superset: 'pb-s1' },
  { id: 'tex-pb-4', exerciseId: EX.lateralRaise, sets: 2, repMin: 12, repMax: 15, rirMin: 1, rirMax: 2, rest: 60, superset: 'pb-s1' },
]

const LEGS_B: TexSeed[] = [
  { id: 'tex-gb-1', exerciseId: EX.bulgarianSplitSquat, sets: 2, repMin: 8, repMax: 10, rirMin: 2, rirMax: 3, rest: 105, alternatives: [EX.reverseLunge, EX.stepUp] },
  { id: 'tex-gb-2', exerciseId: EX.hipThrust, sets: 2, repMin: 8, repMax: 10, rirMin: 2, rirMax: 2, rest: 120, alternatives: [EX.dbLegCurl] },
  { id: 'tex-gb-3', exerciseId: EX.pallofPress, sets: 2, repMin: 10, repMax: 12, rirMin: 2, rirMax: 2, rest: 45, alternatives: [EX.hangingKneeRaise, EX.lyingLegRaise] },
]

// SPEC 9 — warm-up checklists (general + day-specific optional preparation)
export const WARMUP_GENERAL = [
  '5-minute incline walk or easy bike',
  'Chin Tuck × 15',
  'Band Pull-Apart × 20',
  'Wall Slide × 15',
  'Dead Hang × 30 seconds',
  'Cat-Camel × 10',
]
export const WARMUP_UPPER = ['Light Cable Row × 15', 'Shoulder External Rotation × 12 per side']
export const WARMUP_LOWER = [
  'Bodyweight Squat × 10',
  'Hip-Hinge Drill × 10',
  'Glute Bridge × 12',
  'Ankle Rocks × 10 per side',
]

/**
 * Builds the default program rows (exercise library, variants, templates,
 * template exercises, weekly schedule). Shared by first-run seeding and the
 * Plan/Settings "Restore defaults" action — single source of truth, no copies.
 */
export function buildDefaultProgram(t: string = nowIso()): {
  exercises: Exercise[]
  variants: ExerciseVariant[]
  templates: WorkoutTemplate[]
  templateExercises: TemplateExercise[]
  scheduledDays: ScheduledDay[]
} {
  const exercises: Exercise[] = EXERCISES.map((e) => ({
    id: e.id,
    name: e.name,
    kind: e.kind,
    unilateral: e.unilateral ?? false,
    loadConvention: e.perDumbbell ? 'perDumbbell' : null,
    defaultIncrementKg: e.incrementKg,
    createdAt: t,
    updatedAt: t,
  }))

  const variants: ExerciseVariant[] = [
    { id: OHP_VARIANTS.barbell, exerciseId: EX.overheadPress, name: 'Barbell', isDefault: true, createdAt: t, updatedAt: t },
    { id: OHP_VARIANTS.seatedDumbbell, exerciseId: EX.overheadPress, name: 'Seated Dumbbell', isDefault: false, createdAt: t, updatedAt: t },
    { id: OHP_VARIANTS.machine, exerciseId: EX.overheadPress, name: 'Machine', isDefault: false, createdAt: t, updatedAt: t },
    { id: OHP_VARIANTS.landmine, exerciseId: EX.overheadPress, name: 'Landmine', isDefault: false, createdAt: t, updatedAt: t },
  ]

  const templates: WorkoutTemplate[] = [
    { id: TEMPLATE_IDS.pushA, name: 'Push A', kind: 'upperA', isDefault: true, orderIndex: 0, createdAt: t, updatedAt: t },
    { id: TEMPLATE_IDS.pullA, name: 'Pull A', kind: 'upperB', isDefault: true, orderIndex: 1, createdAt: t, updatedAt: t },
    { id: TEMPLATE_IDS.legsA, name: 'Legs A', kind: 'lower', isDefault: true, orderIndex: 2, createdAt: t, updatedAt: t },
    { id: TEMPLATE_IDS.pushB, name: 'Push B', kind: 'upperA', isDefault: true, orderIndex: 3, createdAt: t, updatedAt: t },
    { id: TEMPLATE_IDS.pullB, name: 'Pull B', kind: 'upperB', isDefault: true, orderIndex: 4, createdAt: t, updatedAt: t },
    { id: TEMPLATE_IDS.legsB, name: 'Legs B', kind: 'lower', isDefault: true, orderIndex: 5, createdAt: t, updatedAt: t },
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
    ...toTex(TEMPLATE_IDS.pushA, PUSH_A),
    ...toTex(TEMPLATE_IDS.pullA, PULL_A),
    ...toTex(TEMPLATE_IDS.legsA, LEGS_A),
    ...toTex(TEMPLATE_IDS.pushB, PUSH_B),
    ...toTex(TEMPLATE_IDS.pullB, PULL_B),
    ...toTex(TEMPLATE_IDS.legsB, LEGS_B),
  ]

  // REVISION 2026-08-06 — 6-morning schedule: Push/Pull/Legs A-B Mon-Sat with
  // a 20-minute cardio target on every training day (2 quality runs, 2 easy
  // runs, 2 low-impact bike/incline-walk days by convention), Sunday full rest.
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

  const cardio = { cardioMinutesMin: 20, cardioMinutesMax: 20 }
  const scheduledDays: ScheduledDay[] = [
    day(0, 'rest', { stepsOptional: true, postureOptional: true }),
    day(1, 'strength', { templateId: TEMPLATE_IDS.pullA, postureRequired: true, ...cardio }),
    day(2, 'strength', { templateId: TEMPLATE_IDS.pushA, ...cardio }),
    day(3, 'strength', { templateId: TEMPLATE_IDS.legsA, ...cardio }),
    day(4, 'strength', { templateId: TEMPLATE_IDS.pullB, ...cardio }),
    day(5, 'strength', { templateId: TEMPLATE_IDS.pushB, postureRequired: true, ...cardio }),
    day(6, 'strength', { templateId: TEMPLATE_IDS.legsB, ...cardio }),
  ]

  return { exercises, variants, templates, templateExercises, scheduledDays }
}

export async function seedDefaults(): Promise<void> {
  const existing = await db.userProfile.get('profile')
  if (existing) return
  const t = nowIso()
  const { exercises, variants, templates, templateExercises, scheduledDays } =
    buildDefaultProgram(t)

  // SPEC 10 — posture routine, Mon/Fri required, Wed optional
  const posture: PostureRoutineTemplate = {
    id: 'posture',
    items: [
      { id: 'po-1', name: 'Chin Tuck', prescription: '2 × 15' },
      { id: 'po-2', name: 'Doorway Pec Stretch', prescription: '2 × 45 s' },
      { id: 'po-3', name: 'Wall Slide or Wall Angel', prescription: '2 × 12' },
      { id: 'po-4', name: 'Dead Hang', prescription: '2 × 30–40 s' },
      { id: 'po-5', name: 'Thoracic Extension', prescription: '2 minutes' },
    ],
    requiredDays: [1, 5],
    optionalDays: [3, 6],
    updatedAt: t,
  }

  // SPEC 22 — profile defaults (editable estimates, not medical facts)
  const profile: UserProfile = {
    id: 'profile',
    name: 'Furkan',
    heightCm: 175,
    estimatedBodyFatPct: 18,
    targetBodyFatPct: 13.5,
    targetWeightMinKg: 82,
    targetWeightMaxKg: 84,
    weeklyLossPctMin: 0.4,
    weeklyLossPctMax: 0.7,
    programStartDateKey: '2026-08-02',
    createdAt: t,
    updatedAt: t,
  }

  // SPEC 23 — carbs derived from remaining calories, never hard-coded
  const calories = 2450
  const proteinG = 185
  const fatG = 75
  const carbsG = Math.round((calories - proteinG * 4 - fatG * 9) / 4)

  const settings: AppSettings = {
    id: 'settings',
    theme: 'dark',
    decimalPrecision: 1,
    dumbbellConvention: 'perDumbbell',
    reducedMotion: false,
    setRowDensity: 'comfortable',
    weekStartsOn: 1,
    soundEnabled: true,
    keepScreenAwake: true,
    autoStartRestTimer: true,
    warmupTimersEnabled: false,
    rirVisible: true,
    warmupsVisible: true,
    rampSetsEnabled: true,
    supersetSuggestionsEnabled: true,
    defaultEquipmentNote: '',
    stepTargetMin: 8000,
    stepTargetMax: 10000,
    weeklyZone2Target: 1,
    zone2MinutesMin: 30,
    zone2MinutesMax: 40,
    nutrition: { calories, proteinG, fatG, carbsG },
    supplementsEnabled: false,
    lastBackupAt: null,
    demoDataEnabled: false,
    updatedAt: t,
  }

  // SPEC 23 — meal ideas as simple editable entries (no CRUD screens in V1)
  const meals: MealTemplate[] = [
    { id: 'meal-1', title: 'Breakfast', text: 'Eggs, oats, whey, berries or banana', orderIndex: 0, createdAt: t, updatedAt: t },
    { id: 'meal-2', title: 'Protein bowl', text: 'Quark or yogurt, whey if needed, fruit, moderate granola', lactoseAlternative: 'Lactose-free quark/yogurt', orderIndex: 1, createdAt: t, updatedAt: t },
    { id: 'meal-3', title: 'Main meal', text: 'Chicken, turkey, lean beef, meatballs, or tuna; rice, potato, tortilla, or lavaş; salad or vegetables; yogurt or ayran where tolerated', lactoseAlternative: 'Skip yogurt/ayran', orderIndex: 2, createdAt: t, updatedAt: t },
    { id: 'meal-4', title: 'Snack', text: 'High-protein yogurt or quark, fruit, whey shake, hummus with an appropriate accompaniment', lactoseAlternative: 'Whey isolate / lactose-free quark', orderIndex: 3, createdAt: t, updatedAt: t },
  ]

  await db.transaction(
    'rw',
    [
      db.userProfile,
      db.appSettings,
      db.exercises,
      db.exerciseVariants,
      db.workoutTemplates,
      db.templateExercises,
      db.scheduledDays,
      db.postureRoutineTemplates,
      db.mealTemplates,
      db.supplementItems,
    ],
    async () => {
      await db.userProfile.add(profile)
      await db.appSettings.add(settings)
      await db.exercises.bulkAdd(exercises)
      await db.exerciseVariants.bulkAdd(variants)
      await db.workoutTemplates.bulkAdd(templates)
      await db.templateExercises.bulkAdd(templateExercises)
      await db.scheduledDays.bulkAdd(scheduledDays)
      await db.postureRoutineTemplates.add(posture)
      await db.mealTemplates.bulkAdd(meals)
      await db.supplementItems.bulkAdd(
        SUPPLEMENT_SEED.map((x, i) => ({ ...x, orderIndex: i, createdAt: t, updatedAt: t })),
      )
    },
  )
}
