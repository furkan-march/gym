import { BACKUP_SCHEMA_VERSION, GymDB } from '../db'
import type {
  AppBackup,
  AppSettings,
  BodyMetric,
  Exercise,
  ExerciseSession,
  SetLog,
  UserProfile,
  WorkoutSession,
} from '../types'
import { exportBackup, importBackup, previewBackup } from './backup'

const T = '2026-08-04T10:00:00.000Z'

function freshDb(): GymDB {
  return new GymDB('test-' + crypto.randomUUID())
}

function makeExercise(id: string, name: string): Exercise {
  return {
    id,
    name,
    kind: 'weighted',
    unilateral: false,
    loadConvention: null,
    defaultIncrementKg: 2.5,
    createdAt: T,
    updatedAt: T,
  }
}

function makeSession(id: string): WorkoutSession {
  return {
    id,
    templateId: 'tpl-upper-a',
    templateName: 'Upper A',
    templateKind: 'upperA',
    dateKey: '2026-08-04',
    startedAt: T,
    finishedAt: T,
    status: 'completed',
    bodyweightAtSessionKg: 90,
    activeSeconds: 3200,
    lastActivatedAt: null,
    createdAt: T,
    updatedAt: T,
  }
}

function makeExerciseSession(id: string, workoutSessionId: string, exerciseId: string): ExerciseSession {
  return {
    id,
    workoutSessionId,
    exerciseId,
    variantId: null,
    equipmentContextId: null,
    exerciseName: 'Bench Press',
    variantName: null,
    status: 'completed',
    orderIndex: 0,
    isUnplanned: false,
    substitutedByExerciseSessionId: null,
    substitutedFromExerciseSessionId: null,
    prescription: {
      prescribedSets: 3,
      repRangeMin: 6,
      repRangeMax: 10,
      targetRIRMin: 1,
      targetRIRMax: 2,
      restSeconds: 150,
      incrementKg: 2.5,
      isOptional: false,
      supersetGroup: null,
    },
    createdAt: T,
    updatedAt: T,
  }
}

function makeSet(id: string, exerciseSessionId: string, workoutSessionId: string): SetLog {
  return {
    id,
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
  }
}

function makeSettings(): AppSettings {
  return {
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
    warmupTimersEnabled: true,
    rirVisible: true,
    warmupsVisible: true,
    rampSetsEnabled: true,
    supersetSuggestionsEnabled: true,
    defaultEquipmentNote: '',
    stepTargetMin: 8000,
    stepTargetMax: 10000,
    weeklyZone2Target: 1,
    zone2MinutesMin: 30,
    zone2MinutesMax: 45,
    nutrition: { calories: 2200, proteinG: 180, fatG: 70, carbsG: 212.5 },
    lastBackupAt: null,
    demoDataEnabled: false,
    updatedAt: T,
  }
}

function makeProfile(): UserProfile {
  return {
    id: 'profile',
    name: 'Furkan',
    heightCm: 180,
    estimatedBodyFatPct: 25,
    targetBodyFatPct: 15,
    targetWeightMinKg: 78,
    targetWeightMaxKg: 82,
    weeklyLossPctMin: 0.5,
    weeklyLossPctMax: 1,
    programStartDateKey: '2026-08-01',
    createdAt: T,
    updatedAt: T,
  }
}

function makeBodyMetric(id: string, dateKey: string): BodyMetric {
  return {
    id,
    dateKey,
    weightKg: 90.2,
    waistCm: 100,
    bodyFatPct: null,
    createdAt: T,
    updatedAt: T,
  }
}

async function seedSample(db: GymDB): Promise<void> {
  await db.userProfile.add(makeProfile())
  await db.appSettings.add(makeSettings())
  await db.exercises.bulkAdd([
    makeExercise('ex-bench-press', 'Bench Press'),
    makeExercise('ex-squat', 'Squat'),
  ])
  await db.workoutSessions.add(makeSession('ws1'))
  await db.exerciseSessions.add(makeExerciseSession('es1', 'ws1', 'ex-bench-press'))
  await db.setLogs.bulkAdd([makeSet('set1', 'es1', 'ws1'), makeSet('set2', 'es1', 'ws1')])
  await db.bodyMetrics.add(makeBodyMetric('bm1', '2026-08-04'))
}

function emptyData(): AppBackup['data'] {
  return {
    userProfile: [],
    appSettings: [],
    exercises: [],
    exerciseVariants: [],
    equipmentContexts: [],
    workoutTemplates: [],
    templateExercises: [],
    scheduledDays: [],
    workoutSessions: [],
    exerciseSessions: [],
    setLogs: [],
    readinessLogs: [],
    sessionFeedbacks: [],
    bodyMetrics: [],
    dailyActivities: [],
    cardioSessions: [],
    postureRoutineTemplates: [],
    postureRoutineLogs: [],
    nutritionAdherenceLogs: [],
    mealTemplates: [],
    weeklyCheckIns: [],
    progressionResponses: [],
    personalRecords: [],
  }
}

function makeBackup(overrides: Partial<AppBackup> = {}): AppBackup {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: '1.0.0',
    exportedAt: T,
    data: emptyData(),
    ...overrides,
  }
}

describe('exportBackup / importBackup roundtrip', () => {
  it('preserves all rows, counts, and resets the runtime singletons', async () => {
    const src = freshDb()
    await seedSample(src)
    const backup = await exportBackup(src)

    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION)
    expect(backup.exportedAt).toBeTruthy()
    expect(backup.data.exercises).toHaveLength(2)

    const dst = freshDb()
    // pre-existing data in the destination is replaced, not merged
    await dst.exercises.add(makeExercise('junk', 'Junk Exercise'))

    const result = await importBackup(dst, backup)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)

    expect(result.counts.exercises).toBe(2)
    expect(result.counts.setLogs).toBe(2)
    expect(result.counts.userProfile).toBe(1)

    expect(await dst.exercises.get('junk')).toBeUndefined()
    expect(await dst.exercises.count()).toBe(2)

    // full-fidelity roundtrip: re-exporting the destination yields identical data
    const reExport = await exportBackup(dst)
    expect(reExport.data).toEqual(backup.data)

    // singletons are reset, never imported
    const active = await dst.activeWorkoutState.get('active')
    expect(active).toBeDefined()
    expect(active?.workoutSessionId).toBeNull()
    const rest = await dst.restTimerState.get('rest')
    expect(rest).toBeDefined()
    expect(rest?.endsAt).toBeNull()
  })

  it('accepts the backup as a raw JSON string', async () => {
    const src = freshDb()
    await seedSample(src)
    const backup = await exportBackup(src)

    const dst = freshDb()
    const result = await importBackup(dst, JSON.stringify(backup))
    expect(result.ok).toBe(true)
    expect(await dst.setLogs.count()).toBe(2)
  })

  it('runs the personal-records rebuild callback after a successful import', async () => {
    const db = freshDb()
    let calls = 0
    const result = await importBackup(db, makeBackup(), async (d) => {
      calls += 1
      expect(d).toBe(db)
    })
    expect(result.ok).toBe(true)
    expect(calls).toBe(1)
  })
})

describe('importBackup validation', () => {
  it('rejects a structurally invalid backup with a useful error', async () => {
    const db = freshDb()
    const result = await importBackup(db, { hello: 'world' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toContain('does not match the expected format')
    expect(result.error).toContain('schemaVersion')
  })

  it('rejects a non-JSON string', async () => {
    const db = freshDb()
    const result = await importBackup(db, '{definitely not json')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toContain('not valid JSON')
  })

  it('points at the offending row when a nested field is invalid', async () => {
    const db = freshDb()
    const backup = makeBackup()
    const bad = makeSet('set1', 'es1', 'ws1')
    backup.data.setLogs.push({ ...bad, reps: 'three' as unknown as number })
    const result = await importBackup(db, backup)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toContain('setLogs')
    // nothing was written
    expect(await db.setLogs.count()).toBe(0)
  })

  it('rejects a backup with a newer schemaVersion', async () => {
    const db = freshDb()
    const result = await importBackup(db, makeBackup({ schemaVersion: BACKUP_SCHEMA_VERSION + 1 }))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toContain('newer version')
  })

  it('refuses to import while a workout is active and leaves data untouched', async () => {
    const db = freshDb()
    await db.exercises.add(makeExercise('keep-me', 'Keep Me'))
    await db.activeWorkoutState.put({
      id: 'active',
      workoutSessionId: 'ws-live',
      currentExerciseSessionId: null,
      updatedAt: T,
    })

    const result = await importBackup(db, makeBackup())
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error.toLowerCase()).toContain('active')

    expect(await db.exercises.get('keep-me')).toBeDefined()
    const active = await db.activeWorkoutState.get('active')
    expect(active?.workoutSessionId).toBe('ws-live')
  })
})

describe('importBackup transaction safety', () => {
  it('rolls the whole import back when a bulkAdd fails (duplicate id)', async () => {
    const db = freshDb()
    await db.exercises.add(makeExercise('pre-existing', 'Pre-Existing'))
    await db.bodyMetrics.add(makeBodyMetric('bm-old', '2026-07-01'))

    const backup = makeBackup()
    backup.data.exercises.push(makeExercise('incoming', 'Incoming'))
    const dup = makeSet('dup-set', 'es1', 'ws1')
    // duplicate primary key passes Zod but fails bulkAdd inside the transaction
    backup.data.setLogs.push(dup, { ...dup })

    const result = await importBackup(db, backup)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toContain('rolled back')

    // pre-import data survives; nothing from the backup landed
    expect(await db.exercises.get('pre-existing')).toBeDefined()
    expect(await db.exercises.get('incoming')).toBeUndefined()
    expect(await db.bodyMetrics.get('bm-old')).toBeDefined()
    expect(await db.exercises.count()).toBe(1)
    expect(await db.setLogs.count()).toBe(0)
  })
})

describe('previewBackup', () => {
  it('summarizes table counts and metadata without touching the DB', () => {
    const backup = makeBackup()
    backup.data.exercises.push(makeExercise('e1', 'Bench Press'))
    backup.data.setLogs.push(makeSet('s1', 'es1', 'ws1'))

    const preview = previewBackup(backup)
    expect(preview.ok).toBe(true)
    if (!preview.ok) throw new Error(preview.error)

    expect(preview.exportedAt).toBe(T)
    expect(preview.appVersion).toBe('1.0.0')
    expect(preview.summary.find((s) => s.table === 'exercises')?.count).toBe(1)
    expect(preview.summary.find((s) => s.table === 'setLogs')?.count).toBe(1)
    expect(preview.summary.find((s) => s.table === 'bodyMetrics')?.count).toBe(0)
    expect(preview.summary).toHaveLength(23)
  })

  it('reports validation errors', () => {
    const preview = previewBackup('{broken')
    expect(preview.ok).toBe(false)
    if (preview.ok) throw new Error('expected failure')
    expect(preview.error).toContain('not valid JSON')
  })

  it('rejects newer schema versions', () => {
    const preview = previewBackup(makeBackup({ schemaVersion: BACKUP_SCHEMA_VERSION + 5 }))
    expect(preview.ok).toBe(false)
    if (preview.ok) throw new Error('expected failure')
    expect(preview.error).toContain('newer version')
  })
})
