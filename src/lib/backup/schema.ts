import * as z from 'zod/v4'

/**
 * Zod schemas for the AppBackup file format (SPEC 30).
 *
 * Pragmatic validation: every row must carry its id, foreign keys, dateKeys,
 * enums and the numeric fields the engines depend on. Unknown extra fields
 * pass through (looseObject) so a backup written by a slightly newer minor
 * revision still imports; genuinely newer schemas are rejected by
 * schemaVersion in backup.ts before this schema runs.
 */

const id = z.string().min(1)
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a YYYY-MM-DD date key')
const timestamp = z.string().min(1)
const weekday = z.number().int().min(0).max(6)

const loadConvention = z.enum(['perDumbbell', 'combined'])
const bodyweightMode = z.enum(['none', 'bodyweight', 'added', 'assistedMachine', 'assistedBand'])
const side = z.enum(['left', 'right'])
const exerciseKind = z.enum(['weighted', 'bodyweight', 'repsOnly'])
const templateKind = z.enum(['upperA', 'upperB', 'lower', 'custom'])
const planKind = z.enum(['strength', 'zone2', 'recovery', 'rest'])

export const userProfileSchema = z.looseObject({
  id: z.literal('profile'),
  name: z.string(),
  heightCm: z.number(),
  estimatedBodyFatPct: z.number().nullable(),
  targetBodyFatPct: z.number(),
  targetWeightMinKg: z.number(),
  targetWeightMaxKg: z.number(),
  weeklyLossPctMin: z.number(),
  weeklyLossPctMax: z.number(),
  programStartDateKey: dateKey,
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const appSettingsSchema = z.looseObject({
  id: z.literal('settings'),
  theme: z.enum(['dark', 'light', 'system']),
  decimalPrecision: z.union([z.literal(1), z.literal(2)]),
  dumbbellConvention: loadConvention,
  weekStartsOn: weekday,
  nutrition: z.looseObject({
    calories: z.number(),
    proteinG: z.number(),
    fatG: z.number(),
    carbsG: z.number(),
  }),
  lastBackupAt: timestamp.nullable(),
  updatedAt: timestamp,
})

export const exerciseSchema = z.looseObject({
  id,
  name: z.string().min(1),
  kind: exerciseKind,
  unilateral: z.boolean(),
  loadConvention: loadConvention.nullable(),
  defaultIncrementKg: z.number(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const exerciseVariantSchema = z.looseObject({
  id,
  exerciseId: id,
  name: z.string().min(1),
  isDefault: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const equipmentContextSchema = z.looseObject({
  id,
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const workoutTemplateSchema = z.looseObject({
  id,
  name: z.string().min(1),
  kind: templateKind,
  isDefault: z.boolean(),
  orderIndex: z.number(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

const rampStepSchema = z.looseObject({
  pct: z.number(),
  reps: z.number(),
})

export const templateExerciseSchema = z.looseObject({
  id,
  templateId: id,
  exerciseId: id,
  defaultVariantId: id.nullable(),
  orderIndex: z.number(),
  prescribedSets: z.number(),
  repRangeMin: z.number(),
  repRangeMax: z.number(),
  targetRIRMin: z.number(),
  targetRIRMax: z.number(),
  restSeconds: z.number(),
  incrementKg: z.number().nullable(),
  isOptional: z.boolean(),
  supersetGroup: z.string().nullable(),
  alternativeExerciseIds: z.array(z.string()),
  rampScheme: z.array(rampStepSchema),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const scheduledDaySchema = z.looseObject({
  id,
  weekday,
  planKind,
  templateId: id.nullable(),
  postureRequired: z.boolean(),
  postureOptional: z.boolean(),
  cardioMinutesMin: z.number().nullable(),
  cardioMinutesMax: z.number().nullable(),
  stepsOptional: z.boolean(),
  updatedAt: timestamp,
})

export const workoutSessionSchema = z.looseObject({
  id,
  templateId: id.nullable(),
  templateName: z.string(),
  templateKind,
  dateKey,
  startedAt: timestamp,
  finishedAt: timestamp.nullable(),
  status: z.enum(['active', 'completed', 'discarded']),
  bodyweightAtSessionKg: z.number().nullable(),
  activeSeconds: z.number(),
  lastActivatedAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

const prescriptionSnapshotSchema = z.looseObject({
  prescribedSets: z.number(),
  repRangeMin: z.number(),
  repRangeMax: z.number(),
  targetRIRMin: z.number(),
  targetRIRMax: z.number(),
  restSeconds: z.number(),
  incrementKg: z.number(),
  isOptional: z.boolean(),
  supersetGroup: z.string().nullable(),
})

export const exerciseSessionSchema = z.looseObject({
  id,
  workoutSessionId: id,
  exerciseId: id,
  variantId: id.nullable(),
  equipmentContextId: id.nullable(),
  exerciseName: z.string(),
  variantName: z.string().nullable(),
  status: z.enum(['pending', 'inProgress', 'completed', 'skipped', 'substituted']),
  orderIndex: z.number(),
  isUnplanned: z.boolean(),
  substitutedByExerciseSessionId: id.nullable(),
  substitutedFromExerciseSessionId: id.nullable(),
  prescription: prescriptionSnapshotSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const setLogSchema = z.looseObject({
  id,
  workoutSessionId: id,
  exerciseSessionId: id,
  exerciseId: id,
  variantId: id.nullable(),
  equipmentContextId: id.nullable(),
  loadKg: z.number().nullable(),
  reps: z.number().nullable(),
  rir: z.number().nullable(),
  completed: z.boolean(),
  isWarmup: z.boolean(),
  side: side.nullable(),
  bodyweightMode,
  addedWeightKg: z.number().nullable(),
  assistanceWeightKg: z.number().nullable(),
  loadConvention: loadConvention.nullable(),
  orderIndex: z.number(),
  completedAt: timestamp.nullable(),
  formQuality: z.literal('poor').nullable(),
  painFlag: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const readinessLogSchema = z.looseObject({
  id,
  dateKey,
  workoutSessionId: id.nullable(),
  sleep: z.number(),
  energy: z.number(),
  motivation: z.number(),
  soreness: z.number(),
  stress: z.number(),
  kneeComfort: z.number().nullable(),
  createdAt: timestamp,
})

export const sessionFeedbackSchema = z.looseObject({
  id,
  workoutSessionId: id,
  difficulty: z.number().nullable(),
  jointDiscomfort: z.enum(['none', 'mild', 'moderate', 'severe']).nullable(),
  kneeComfortAfter: z.number().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const bodyMetricSchema = z.looseObject({
  id,
  dateKey,
  weightKg: z.number().nullable(),
  waistCm: z.number().nullable(),
  bodyFatPct: z.number().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const dailyActivitySchema = z.looseObject({
  id,
  dateKey,
  steps: z.number().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const cardioSessionSchema = z.looseObject({
  id,
  dateKey,
  type: z.enum([
    'outdoorWalk',
    'inclineTreadmill',
    'stationaryBike',
    'elliptical',
    'rowing',
    'run',
    'other',
  ]),
  minutes: z.number(),
  distanceKm: z.number().nullable(),
  avgHeartRate: z.number().nullable(),
  perceivedIntensity: z.number().nullable(),
  isZone2: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

const postureItemSchema = z.looseObject({
  id,
  name: z.string(),
  prescription: z.string(),
})

export const postureRoutineTemplateSchema = z.looseObject({
  id: z.literal('posture'),
  items: z.array(postureItemSchema),
  requiredDays: z.array(weekday),
  optionalDays: z.array(weekday),
  updatedAt: timestamp,
})

export const postureRoutineLogSchema = z.looseObject({
  id,
  dateKey,
  completedItemIds: z.array(z.string()),
  totalItems: z.number(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const nutritionAdherenceLogSchema = z.looseObject({
  id,
  dateKey,
  calories: z.enum(['under', 'onTarget', 'over', 'notTracked']),
  protein: z.enum(['reached', 'nearly', 'missed', 'notTracked']),
  fruitVeg: z.boolean().nullable(),
  water: z.boolean().nullable(),
  hunger: z.number().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const mealTemplateSchema = z.looseObject({
  id,
  title: z.string(),
  text: z.string(),
  orderIndex: z.number(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const weeklyCheckInSchema = z.looseObject({
  id,
  weekStartDateKey: dateKey,
  currentAvgWeightKg: z.number().nullable(),
  previousAvgWeightKg: z.number().nullable(),
  weightChangePct: z.number().nullable(),
  waistCm: z.number().nullable(),
  strengthSessionsCompleted: z.number(),
  strengthSessionsScheduled: z.number(),
  cardioMinutes: z.number(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const progressionResponseSchema = z.looseObject({
  id,
  exerciseId: id,
  variantId: id.nullable(),
  equipmentContextId: id.nullable(),
  sourceSessionId: id,
  contentHash: z.string(),
  response: z.enum(['accepted', 'edited', 'dismissed']),
  editedLoadKg: z.number().nullable(),
  respondedAt: timestamp,
})

export const personalRecordSchema = z.looseObject({
  id,
  exerciseId: id,
  variantId: id.nullable(),
  equipmentContextId: id.nullable(),
  kind: z.enum([
    'heaviestLoad',
    'best1RM',
    'mostRepsAtLoad',
    'bestSessionVolume',
    'bestSet',
    'bodyweightReps',
    'addedWeightPullup',
    'heaviestEffectiveLoad',
  ]),
  value: z.number(),
  secondaryValue: z.number().nullable(),
  setLogId: id.nullable(),
  workoutSessionId: id,
  dateKey,
  createdAt: timestamp,
})

export const supplementItemSchema = z.looseObject({
  id,
  name: z.string(),
  reminderNote: z.string().nullable(),
  orderIndex: z.number(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const supplementLogSchema = z.looseObject({
  id,
  dateKey,
  takenItemIds: z.array(id),
  createdAt: timestamp,
  updatedAt: timestamp,
})

/** Keys mirror BACKUP_TABLES in db.ts exactly (Active/RestTimer state excluded). */
export const backupDataSchema = z.looseObject({
  userProfile: z.array(userProfileSchema),
  appSettings: z.array(appSettingsSchema),
  exercises: z.array(exerciseSchema),
  exerciseVariants: z.array(exerciseVariantSchema),
  equipmentContexts: z.array(equipmentContextSchema),
  workoutTemplates: z.array(workoutTemplateSchema),
  templateExercises: z.array(templateExerciseSchema),
  scheduledDays: z.array(scheduledDaySchema),
  workoutSessions: z.array(workoutSessionSchema),
  exerciseSessions: z.array(exerciseSessionSchema),
  setLogs: z.array(setLogSchema),
  readinessLogs: z.array(readinessLogSchema),
  sessionFeedbacks: z.array(sessionFeedbackSchema),
  bodyMetrics: z.array(bodyMetricSchema),
  dailyActivities: z.array(dailyActivitySchema),
  cardioSessions: z.array(cardioSessionSchema),
  postureRoutineTemplates: z.array(postureRoutineTemplateSchema),
  postureRoutineLogs: z.array(postureRoutineLogSchema),
  nutritionAdherenceLogs: z.array(nutritionAdherenceLogSchema),
  mealTemplates: z.array(mealTemplateSchema),
  weeklyCheckIns: z.array(weeklyCheckInSchema),
  progressionResponses: z.array(progressionResponseSchema),
  personalRecords: z.array(personalRecordSchema),
  // V2 tables — .default([]) keeps schema-version-1 backups importable.
  supplementItems: z.array(supplementItemSchema).default([]),
  supplementLogs: z.array(supplementLogSchema).default([]),
})

export const appBackupSchema = z.looseObject({
  schemaVersion: z.number().int().min(1),
  appVersion: z.string(),
  exportedAt: timestamp,
  data: backupDataSchema,
})

export type ParsedAppBackup = z.infer<typeof appBackupSchema>
export type ParsedBackupData = ParsedAppBackup['data']
