import { db } from '../db'
import { nowIso } from '../ids'
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
  upperA: 'tpl-upper-a',
  upperB: 'tpl-upper-b',
  lower: 'tpl-lower',
} as const

export const EX = {
  benchPress: 'ex-bench-press',
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

export async function seedDefaults(): Promise<void> {
  const existing = await db.userProfile.get('profile')
  if (existing) return
  const t = nowIso()

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
    },
  )
}
