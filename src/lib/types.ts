/**
 * Core data model for the Gym PWA (SPEC.md section 29).
 *
 * Conventions:
 * - `DateKey` is a LOCAL calendar date "YYYY-MM-DD". All per-day records key on it;
 *   never group by UTC timestamps.
 * - Timestamps (`createdAt`, `updatedAt`, ...) are ISO strings from `new Date().toISOString()`.
 * - Loads are kilograms. `loadConvention` is snapshotted onto each SetLog at log time.
 * - Sessions snapshot their prescription and bodyweight so later edits to the plan or
 *   profile never reinterpret history.
 */

export type DateKey = string // "YYYY-MM-DD" local calendar date
export type Timestamp = string // ISO 8601

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6 // Date.getDay(): 0 = Sunday

export type LoadConvention = 'perDumbbell' | 'combined'

export type BodyweightMode =
  | 'none' // plain external-load exercise
  | 'bodyweight'
  | 'added' // bodyweight + external load
  | 'assistedMachine' // bodyweight - assistance
  | 'assistedBand' // no numeric effective load unless user estimates assistance

export type Side = 'left' | 'right'

export type ExerciseKind =
  | 'weighted' // barbell/dumbbell/machine/cable
  | 'bodyweight' // pull-up, dip, ... supports BodyweightMode
  | 'repsOnly' // hanging knee raise etc: rep progression, no load math

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export interface Exercise {
  id: string
  name: string
  kind: ExerciseKind
  /** true when sets are logged per side (Bulgarian split squat, Pallof press) */
  unilateral: boolean
  /** display/log convention for two-implement exercises; null for non-dumbbell */
  loadConvention: LoadConvention | null
  /** default load increment in kg; editable per exercise ("smallest available") */
  defaultIncrementKg: number
  notes?: string
  isDemo?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface ExerciseVariant {
  id: string
  exerciseId: string
  name: string
  isDefault: boolean
  isDemo?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface EquipmentContext {
  id: string
  gym?: string
  machineName?: string
  machineId?: string
  seatSetting?: string
  handleSetting?: string
  note?: string
  isDemo?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ---------------------------------------------------------------------------
// Program / plan
// ---------------------------------------------------------------------------

export type TemplateKind = 'upperA' | 'upperB' | 'lower' | 'custom'

export interface WorkoutTemplate {
  id: string
  name: string
  kind: TemplateKind
  isDefault: boolean
  orderIndex: number
  isDemo?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** One ramp-up (warm-up) set derived from the recommended working load. */
export interface RampStep {
  /** fraction of working load, e.g. 0.6 for 60% */
  pct: number
  reps: number
}

export interface TemplateExercise {
  id: string
  templateId: string
  exerciseId: string
  /** preferred variant; null = exercise's default variant */
  defaultVariantId: string | null
  orderIndex: number
  prescribedSets: number // per side for unilateral exercises
  repRangeMin: number
  repRangeMax: number
  targetRIRMin: number
  targetRIRMax: number
  restSeconds: number
  /** null = use the exercise's defaultIncrementKg */
  incrementKg: number | null
  isOptional: boolean
  /** exercises sharing a non-null value form a suggested superset */
  supersetGroup: string | null
  /** alternative exercise ids offered for quick substitution */
  alternativeExerciseIds: string[]
  /** seeded ramp-up scheme for the first compound of a session; empty = none */
  rampScheme: RampStep[]
  isDemo?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type PlanKind = 'strength' | 'zone2' | 'recovery' | 'rest'

export interface ScheduledDay {
  /** one row per weekday, id = String(weekday) */
  id: string
  weekday: Weekday
  planKind: PlanKind
  /** set when planKind === 'strength' */
  templateId: string | null
  postureRequired: boolean
  postureOptional: boolean
  cardioMinutesMin: number | null
  cardioMinutesMax: number | null
  stepsOptional: boolean
  updatedAt: Timestamp
}

// ---------------------------------------------------------------------------
// Sessions and logging
// ---------------------------------------------------------------------------

export type WorkoutSessionStatus = 'active' | 'completed' | 'discarded'

export interface WorkoutSession {
  id: string
  /** null for fully unplanned sessions */
  templateId: string | null
  /** snapshots so history renders without joining live templates */
  templateName: string
  templateKind: TemplateKind
  /** local date of start; a session started before midnight belongs to that day */
  dateKey: DateKey
  startedAt: Timestamp
  finishedAt: Timestamp | null
  status: WorkoutSessionStatus
  /** snapshot from latest BodyMetric at start, editable in session; null = unknown */
  bodyweightAtSessionKg: number | null
  /** accumulated ACTIVE seconds (save-and-exit freezes accumulation) */
  activeSeconds: number
  /** set while status === 'active' and the app is foreground; null when frozen */
  lastActivatedAt: Timestamp | null
  notes?: string
  isDemo?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type ExerciseSessionStatus =
  | 'pending'
  | 'inProgress'
  | 'completed'
  | 'skipped'
  | 'substituted'

/** Prescription snapshot taken at session start (SPEC 29, REQUIRED FIELD CONTRACTS). */
export interface PrescriptionSnapshot {
  prescribedSets: number
  repRangeMin: number
  repRangeMax: number
  targetRIRMin: number
  targetRIRMax: number
  restSeconds: number
  incrementKg: number
  isOptional: boolean
  supersetGroup: string | null
}

export interface ExerciseSession {
  id: string
  workoutSessionId: string
  exerciseId: string
  variantId: string | null
  equipmentContextId: string | null
  /** name snapshot for history display */
  exerciseName: string
  variantName: string | null
  status: ExerciseSessionStatus
  orderIndex: number
  isUnplanned: boolean
  /** substitution links: replacement gets `substitutedFrom...`, original gets `substitutedBy...` */
  substitutedByExerciseSessionId: string | null
  substitutedFromExerciseSessionId: string | null
  prescription: PrescriptionSnapshot
  note?: string
  isDemo?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface SetLog {
  id: string
  workoutSessionId: string
  exerciseSessionId: string
  exerciseId: string
  variantId: string | null
  equipmentContextId: string | null
  /** external load in kg (per `loadConvention` for dumbbells); null for pure bodyweight */
  loadKg: number | null
  reps: number | null
  /** 0..5; null = not logged (missing RIR never blocks progression) */
  rir: number | null
  completed: boolean
  isWarmup: boolean
  /** set for unilateral exercises */
  side: Side | null
  bodyweightMode: BodyweightMode
  addedWeightKg: number | null
  assistanceWeightKg: number | null
  /** snapshotted at log time for dumbbell exercises; null otherwise */
  loadConvention: LoadConvention | null
  orderIndex: number
  completedAt: Timestamp | null
  /** per-set exception flag; only 'poor' is meaningful (two-level model, SPEC 11/14) */
  formQuality: 'poor' | null
  painFlag: boolean
  notes?: string
  isDemo?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Singleton row (id: 'active') pointing at the resumable workout, if any. */
export interface ActiveWorkoutState {
  id: 'active'
  workoutSessionId: string | null
  currentExerciseSessionId: string | null
  updatedAt: Timestamp
}

/** Singleton row (id: 'rest'). Absolute timestamps so suspension never desyncs it. */
export interface RestTimerState {
  id: 'rest'
  /** absolute end time; null = no running timer */
  endsAt: Timestamp | null
  durationSeconds: number
  /** remaining seconds captured when paused; null = not paused */
  pausedRemainingSeconds: number | null
  forExerciseSessionId: string | null
  updatedAt: Timestamp
}

// ---------------------------------------------------------------------------
// Readiness and feedback
// ---------------------------------------------------------------------------

export interface ReadinessLog {
  id: string
  dateKey: DateKey
  workoutSessionId: string | null
  sleep: number // 1..5
  energy: number
  motivation: number
  soreness: number
  stress: number
  /** lower-day only */
  kneeComfort: number | null
  note?: string
  isDemo?: boolean
  createdAt: Timestamp
}

export type JointDiscomfort = 'none' | 'mild' | 'moderate' | 'severe'

export interface SessionFeedback {
  id: string
  workoutSessionId: string
  difficulty: number | null // 1..5
  jointDiscomfort: JointDiscomfort | null
  /** lower-day only */
  kneeComfortAfter: number | null
  note?: string
  isDemo?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ---------------------------------------------------------------------------
// Body metrics, activity, posture, nutrition
// ---------------------------------------------------------------------------

export interface BodyMetric {
  id: string
  dateKey: DateKey // unique
  weightKg: number | null
  waistCm: number | null
  bodyFatPct: number | null
  isDemo?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface DailyActivity {
  id: string
  dateKey: DateKey // unique
  steps: number | null
  isDemo?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type CardioType =
  | 'outdoorWalk'
  | 'inclineTreadmill'
  | 'stationaryBike'
  | 'elliptical'
  | 'rowing'
  | 'run'
  | 'other'

export interface CardioSession {
  id: string
  dateKey: DateKey
  type: CardioType
  minutes: number
  distanceKm: number | null
  avgHeartRate: number | null
  /** 1..5 perceived intensity; Zone 2 can be logged by feel */
  perceivedIntensity: number | null
  isZone2: boolean
  notes?: string
  isDemo?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface PostureItem {
  id: string
  name: string
  /** e.g. "2 × 15" or "2 × 45 s" or "2 minutes" */
  prescription: string
}

/** Singleton row (id: 'posture'). */
export interface PostureRoutineTemplate {
  id: 'posture'
  items: PostureItem[]
  /** weekdays the routine is required (streak counts these only) */
  requiredDays: Weekday[]
  /** weekdays it is optional (never affects streaks) */
  optionalDays: Weekday[]
  updatedAt: Timestamp
}

export interface PostureRoutineLog {
  id: string
  dateKey: DateKey // unique
  completedItemIds: string[]
  totalItems: number
  isDemo?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type CalorieAdherence = 'under' | 'onTarget' | 'over' | 'notTracked'
export type ProteinAdherence = 'reached' | 'nearly' | 'missed' | 'notTracked'

export interface NutritionAdherenceLog {
  id: string
  dateKey: DateKey // unique
  calories: CalorieAdherence
  protein: ProteinAdherence
  fruitVeg: boolean | null
  water: boolean | null
  hunger: number | null // 1..5
  notes?: string
  isDemo?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** V1: simple editable text entries (SPEC 23). Table kept for the V2 editor. */
export interface MealTemplate {
  id: string
  title: string
  text: string
  lactoseAlternative?: string
  orderIndex: number
  isDemo?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface WeeklyCheckIn {
  id: string
  /** Monday of the covered week */
  weekStartDateKey: DateKey // unique
  currentAvgWeightKg: number | null
  previousAvgWeightKg: number | null
  weightChangePct: number | null
  waistCm: number | null
  strengthSessionsCompleted: number
  strengthSessionsScheduled: number
  avgSteps: number | null
  cardioMinutes: number
  postureAdherencePct: number | null
  calorieAdherencePct: number | null
  proteinAdherencePct: number | null
  hunger: number | null
  energy: number | null
  gymPerformance: number | null
  sleep: number | null
  stress: number | null
  note?: string
  isDemo?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ---------------------------------------------------------------------------
// Settings and profile
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: 'profile'
  name: string
  heightCm: number
  estimatedBodyFatPct: number | null
  targetBodyFatPct: number
  targetWeightMinKg: number
  targetWeightMaxKg: number
  /** weekly loss target as % of body weight */
  weeklyLossPctMin: number
  weeklyLossPctMax: number
  programStartDateKey: DateKey
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface NutritionTargets {
  calories: number
  proteinG: number
  fatG: number
  /** derived: (calories - protein*4 - fat*9) / 4, recomputed on edit */
  carbsG: number
}

export type ThemeMode = 'dark' | 'light' | 'system'

export interface AppSettings {
  id: 'settings'
  theme: ThemeMode
  decimalPrecision: 1 | 2
  /** global default for new dumbbell exercises; stored per set at log time */
  dumbbellConvention: LoadConvention
  reducedMotion: boolean
  setRowDensity: 'compact' | 'comfortable'
  weekStartsOn: Weekday // 1 = Monday
  soundEnabled: boolean
  keepScreenAwake: boolean
  autoStartRestTimer: boolean
  warmupTimersEnabled: boolean
  rirVisible: boolean
  warmupsVisible: boolean
  rampSetsEnabled: boolean
  supersetSuggestionsEnabled: boolean
  defaultEquipmentNote: string
  stepTargetMin: number
  stepTargetMax: number
  weeklyZone2Target: number // sessions per week
  zone2MinutesMin: number
  zone2MinutesMax: number
  nutrition: NutritionTargets
  /** ISO timestamp of the last successful backup export; null = never */
  lastBackupAt: Timestamp | null
  demoDataEnabled: boolean
  updatedAt: Timestamp
}

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

export type RecommendationResponse = 'accepted' | 'edited' | 'dismissed'

/**
 * Stores ONLY the user's response to a recommendation (SPEC 14, lifecycle).
 * Recommendations themselves are computed on demand from SetLogs.
 */
export interface ProgressionResponse {
  id: string
  exerciseId: string
  variantId: string | null
  equipmentContextId: string | null
  /** the comparable session the recommendation was based on */
  sourceSessionId: string
  /** hash of the recommendation content; mismatch = stale, ignore */
  contentHash: string
  response: RecommendationResponse
  /** for response === 'edited' */
  editedLoadKg: number | null
  respondedAt: Timestamp
}

export type PersonalRecordKind =
  | 'heaviestLoad'
  | 'best1RM'
  | 'mostRepsAtLoad'
  | 'bestSessionVolume'
  | 'bestSet'
  | 'bodyweightReps'
  | 'addedWeightPullup'
  | 'heaviestEffectiveLoad'

export interface PersonalRecord {
  id: string
  exerciseId: string
  variantId: string | null
  equipmentContextId: string | null
  kind: PersonalRecordKind
  /** primary metric value (kg, reps, kg-volume or e1RM depending on kind) */
  value: number
  /** secondary metric, e.g. the load for mostRepsAtLoad */
  secondaryValue: number | null
  setLogId: string | null
  workoutSessionId: string
  dateKey: DateKey
  isDemo?: boolean
  createdAt: Timestamp
}

// ---------------------------------------------------------------------------
// Backup (file format only — never a Dexie table)
// ---------------------------------------------------------------------------

export interface AppBackup {
  schemaVersion: number
  appVersion: string
  exportedAt: Timestamp
  data: {
    userProfile: UserProfile[]
    appSettings: AppSettings[]
    exercises: Exercise[]
    exerciseVariants: ExerciseVariant[]
    equipmentContexts: EquipmentContext[]
    workoutTemplates: WorkoutTemplate[]
    templateExercises: TemplateExercise[]
    scheduledDays: ScheduledDay[]
    workoutSessions: WorkoutSession[]
    exerciseSessions: ExerciseSession[]
    setLogs: SetLog[]
    readinessLogs: ReadinessLog[]
    sessionFeedbacks: SessionFeedback[]
    bodyMetrics: BodyMetric[]
    dailyActivities: DailyActivity[]
    cardioSessions: CardioSession[]
    postureRoutineTemplates: PostureRoutineTemplate[]
    postureRoutineLogs: PostureRoutineLog[]
    nutritionAdherenceLogs: NutritionAdherenceLog[]
    mealTemplates: MealTemplate[]
    weeklyCheckIns: WeeklyCheckIn[]
    progressionResponses: ProgressionResponse[]
    personalRecords: PersonalRecord[]
  }
}
