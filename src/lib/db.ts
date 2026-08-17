import Dexie, { type EntityTable } from 'dexie'
import { SUPPLEMENT_SEED } from './seed/supplements'
import type {
  ActiveWorkoutState,
  AppSettings,
  BodyMetric,
  CardioSession,
  DailyActivity,
  EquipmentContext,
  Exercise,
  ExerciseSession,
  ExerciseVariant,
  MealTemplate,
  NutritionAdherenceLog,
  PersonalRecord,
  PostureRoutineLog,
  PostureRoutineTemplate,
  ProgressionResponse,
  ReadinessLog,
  RestTimerState,
  ScheduledDay,
  SessionFeedback,
  SetLog,
  SupplementItem,
  SupplementLog,
  TemplateExercise,
  UserProfile,
  WeeklyCheckIn,
  WorkoutSession,
  WorkoutTemplate,
} from './types'

/**
 * IndexedDB is the source of truth for all persistent user data (SPEC 3/4).
 * Schema is versioned; future versions must migrate, never destroy.
 */
export class GymDB extends Dexie {
  userProfile!: EntityTable<UserProfile, 'id'>
  appSettings!: EntityTable<AppSettings, 'id'>
  exercises!: EntityTable<Exercise, 'id'>
  exerciseVariants!: EntityTable<ExerciseVariant, 'id'>
  equipmentContexts!: EntityTable<EquipmentContext, 'id'>
  workoutTemplates!: EntityTable<WorkoutTemplate, 'id'>
  templateExercises!: EntityTable<TemplateExercise, 'id'>
  scheduledDays!: EntityTable<ScheduledDay, 'id'>
  workoutSessions!: EntityTable<WorkoutSession, 'id'>
  exerciseSessions!: EntityTable<ExerciseSession, 'id'>
  setLogs!: EntityTable<SetLog, 'id'>
  activeWorkoutState!: EntityTable<ActiveWorkoutState, 'id'>
  restTimerState!: EntityTable<RestTimerState, 'id'>
  readinessLogs!: EntityTable<ReadinessLog, 'id'>
  sessionFeedbacks!: EntityTable<SessionFeedback, 'id'>
  bodyMetrics!: EntityTable<BodyMetric, 'id'>
  dailyActivities!: EntityTable<DailyActivity, 'id'>
  cardioSessions!: EntityTable<CardioSession, 'id'>
  postureRoutineTemplates!: EntityTable<PostureRoutineTemplate, 'id'>
  postureRoutineLogs!: EntityTable<PostureRoutineLog, 'id'>
  nutritionAdherenceLogs!: EntityTable<NutritionAdherenceLog, 'id'>
  mealTemplates!: EntityTable<MealTemplate, 'id'>
  weeklyCheckIns!: EntityTable<WeeklyCheckIn, 'id'>
  progressionResponses!: EntityTable<ProgressionResponse, 'id'>
  personalRecords!: EntityTable<PersonalRecord, 'id'>
  supplementItems!: EntityTable<SupplementItem, 'id'>
  supplementLogs!: EntityTable<SupplementLog, 'id'>

  constructor(name = 'gym') {
    super(name)
    // Note: `isDemo` is deliberately NOT indexed — IndexedDB cannot index
    // booleans, so demo filtering always uses .filter() in JS (SPEC 34).
    this.version(1).stores({
      userProfile: 'id',
      appSettings: 'id',
      exercises: 'id, name',
      exerciseVariants: 'id, exerciseId',
      equipmentContexts: 'id',
      workoutTemplates: 'id, kind, orderIndex',
      templateExercises: 'id, templateId, exerciseId',
      scheduledDays: 'id, weekday',
      workoutSessions: 'id, dateKey, templateId, status',
      exerciseSessions: 'id, workoutSessionId, exerciseId, [exerciseId+variantId]',
      setLogs: 'id, workoutSessionId, exerciseSessionId, exerciseId, [exerciseId+variantId]',
      activeWorkoutState: 'id',
      restTimerState: 'id',
      readinessLogs: 'id, dateKey, workoutSessionId',
      sessionFeedbacks: 'id, workoutSessionId',
      bodyMetrics: 'id, &dateKey',
      dailyActivities: 'id, &dateKey',
      cardioSessions: 'id, dateKey',
      postureRoutineTemplates: 'id',
      postureRoutineLogs: 'id, &dateKey',
      nutritionAdherenceLogs: 'id, &dateKey',
      mealTemplates: 'id, orderIndex',
      weeklyCheckIns: 'id, &weekStartDateKey',
      progressionResponses: 'id, exerciseId, sourceSessionId',
      personalRecords: 'id, exerciseId, kind, [exerciseId+kind], workoutSessionId',
    })

    // V2: supplement checklist tables. Existing installs get the settings flag
    // patched and the default (disabled) checklist seeded; V1 data is untouched.
    this.version(2)
      .stores({
        supplementItems: 'id, orderIndex',
        supplementLogs: 'id, &dateKey',
      })
      .upgrade(async (tx) => {
        const t = new Date().toISOString()
        await tx
          .table('appSettings')
          .toCollection()
          .modify((s: { supplementsEnabled?: boolean }) => {
            if (s.supplementsEnabled === undefined) s.supplementsEnabled = false
          })
        const existing = await tx.table('supplementItems').count()
        if (existing === 0) {
          await tx
            .table('supplementItems')
            .bulkAdd(
              SUPPLEMENT_SEED.map((x, i) => ({ ...x, orderIndex: i, createdAt: t, updatedAt: t })),
            )
        }
      })
  }
}

export const db = new GymDB()

/** All tables included in a full backup (Active/RestTimer state excluded by design). */
export const BACKUP_TABLES = [
  'userProfile',
  'appSettings',
  'exercises',
  'exerciseVariants',
  'equipmentContexts',
  'workoutTemplates',
  'templateExercises',
  'scheduledDays',
  'workoutSessions',
  'exerciseSessions',
  'setLogs',
  'readinessLogs',
  'sessionFeedbacks',
  'bodyMetrics',
  'dailyActivities',
  'cardioSessions',
  'postureRoutineTemplates',
  'postureRoutineLogs',
  'nutritionAdherenceLogs',
  'mealTemplates',
  'weeklyCheckIns',
  'progressionResponses',
  'personalRecords',
  'supplementItems',
  'supplementLogs',
] as const

export const BACKUP_SCHEMA_VERSION = 2
export const APP_VERSION = '2.1.0'
