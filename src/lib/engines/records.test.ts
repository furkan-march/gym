import { GymDB } from '../db'
import type {
  Exercise,
  ExerciseSession,
  PersonalRecord,
  PersonalRecordKind,
  SetLog,
  WorkoutSession,
} from '../types'
import {
  computeRecords,
  detectNewRecords,
  personalRecordId,
  rebuildPersonalRecords,
} from './records'

const T = '2026-07-01T10:00:00.000Z'
const T2 = '2026-07-08T10:00:00.000Z'

function makeExercise(over: Partial<Exercise> & Pick<Exercise, 'id'>): Exercise {
  return {
    name: over.id,
    kind: 'weighted',
    unilateral: false,
    loadConvention: null,
    defaultIncrementKg: 2.5,
    createdAt: T,
    updatedAt: T,
    ...over,
  }
}

function makeSession(over: Partial<WorkoutSession> & Pick<WorkoutSession, 'id'>): WorkoutSession {
  return {
    templateId: null,
    templateName: 'Upper A',
    templateKind: 'upperA',
    dateKey: '2026-07-01',
    startedAt: T,
    finishedAt: T,
    status: 'completed',
    bodyweightAtSessionKg: 90,
    activeSeconds: 3600,
    lastActivatedAt: null,
    createdAt: T,
    updatedAt: T,
    ...over,
  }
}

function makeSet(
  over: Partial<SetLog> & Pick<SetLog, 'id' | 'workoutSessionId' | 'exerciseId'>,
): SetLog {
  return {
    exerciseSessionId: 'es-none',
    variantId: null,
    equipmentContextId: null,
    loadKg: null,
    reps: null,
    rir: null,
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

function makeExerciseSession(
  over: Partial<ExerciseSession> & Pick<ExerciseSession, 'id' | 'workoutSessionId' | 'exerciseId'>,
): ExerciseSession {
  return {
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
      prescribedSets: 4,
      repRangeMin: 6,
      repRangeMax: 8,
      targetRIRMin: 1,
      targetRIRMax: 2,
      restSeconds: 150,
      incrementKg: 2.5,
      isOptional: false,
      supersetGroup: null,
    },
    createdAt: T,
    updatedAt: T,
    ...over,
  }
}

function makePr(
  over: Partial<PersonalRecord> & Pick<PersonalRecord, 'kind' | 'value'>,
): PersonalRecord {
  return {
    id: 'pr-test',
    exerciseId: 'ex-a',
    variantId: null,
    equipmentContextId: null,
    secondaryValue: null,
    setLogId: null,
    workoutSessionId: 's1',
    dateKey: '2026-07-01',
    createdAt: T,
    ...over,
  }
}

function byKind(records: PersonalRecord[], kind: PersonalRecordKind): PersonalRecord | undefined {
  return records.find((r) => r.kind === kind)
}

describe('computeRecords', () => {
  it('heaviestLoad uses the heaviest completed working set; warm-ups and incomplete sets never count', () => {
    const bench = makeExercise({ id: 'ex-bench' })
    const s1 = makeSession({ id: 's1' })
    const sets = [
      makeSet({ id: 'set-1', workoutSessionId: 's1', exerciseId: 'ex-bench', loadKg: 60, reps: 8 }),
      makeSet({ id: 'set-2', workoutSessionId: 's1', exerciseId: 'ex-bench', loadKg: 80, reps: 5, orderIndex: 1 }),
      makeSet({ id: 'set-3', workoutSessionId: 's1', exerciseId: 'ex-bench', loadKg: 100, reps: 3, isWarmup: true, orderIndex: 2 }),
      makeSet({ id: 'set-4', workoutSessionId: 's1', exerciseId: 'ex-bench', loadKg: 90, reps: 1, completed: false, orderIndex: 3 }),
    ]
    const records = computeRecords({ sessions: [s1], exerciseSessions: [], sets, exercises: [bench] })
    const heaviest = byKind(records, 'heaviestLoad')
    expect(heaviest).toBeDefined()
    expect(heaviest?.value).toBe(80)
    expect(heaviest?.secondaryValue).toBe(5)
    expect(heaviest?.setLogId).toBe('set-2')
    expect(heaviest?.workoutSessionId).toBe('s1')
    expect(heaviest?.dateKey).toBe('2026-07-01')
  })

  it('never merges dumbbell loadConvention partitions and prefers perDumbbell rows as stored', () => {
    const curl = makeExercise({ id: 'ex-curl', loadConvention: 'perDumbbell' })
    const s1 = makeSession({ id: 's1' })
    const sets = [
      makeSet({ id: 'set-per', workoutSessionId: 's1', exerciseId: 'ex-curl', loadKg: 24, reps: 10, loadConvention: 'perDumbbell' }),
      // Same performance logged under the combined convention: a bigger number,
      // but not a bigger record.
      makeSet({ id: 'set-comb', workoutSessionId: 's1', exerciseId: 'ex-curl', loadKg: 50, reps: 10, loadConvention: 'combined', orderIndex: 1 }),
    ]
    const records = computeRecords({ sessions: [s1], exerciseSessions: [], sets, exercises: [curl] })
    expect(byKind(records, 'heaviestLoad')?.value).toBe(24)
    expect(byKind(records, 'heaviestLoad')?.setLogId).toBe('set-per')
    // e1RM record is per-dumbbell too.
    expect(byKind(records, 'bestSet')?.value).toBeCloseTo(24 * (1 + 10 / 30), 6)

    // With only combined history, combined rows form the record.
    const combinedOnly = computeRecords({
      sessions: [s1],
      exerciseSessions: [],
      sets: [sets[1] as SetLog],
      exercises: [curl],
    })
    expect(byKind(combinedOnly, 'heaviestLoad')?.value).toBe(50)
  })

  it('best1RM applies Epley to the best valid session set and skips sets above 12 reps', () => {
    const bench = makeExercise({ id: 'ex-bench' })
    const s1 = makeSession({ id: 's1' })
    const sets = [
      makeSet({ id: 'set-1', workoutSessionId: 's1', exerciseId: 'ex-bench', loadKg: 100, reps: 5 }),
      // Higher raw Epley value but 13 reps: not a valid e1RM set (SPEC 20).
      makeSet({ id: 'set-2', workoutSessionId: 's1', exerciseId: 'ex-bench', loadKg: 110, reps: 13, orderIndex: 1 }),
    ]
    const records = computeRecords({ sessions: [s1], exerciseSessions: [], sets, exercises: [bench] })
    const best1rm = byKind(records, 'best1RM')
    expect(best1rm?.value).toBeCloseTo(100 * (1 + 5 / 30), 6)
    expect(best1rm?.setLogId).toBeNull()
    const bestSet = byKind(records, 'bestSet')
    expect(bestSet?.value).toBeCloseTo(100 * (1 + 5 / 30), 6)
    expect(bestSet?.secondaryValue).toBe(5)
    expect(bestSet?.setLogId).toBe('set-1')
  })

  it('mostRepsAtLoad keeps only the best reps at the heaviest load logged', () => {
    const bench = makeExercise({ id: 'ex-bench' })
    const s1 = makeSession({ id: 's1' })
    const sets = [
      makeSet({ id: 'set-1', workoutSessionId: 's1', exerciseId: 'ex-bench', loadKg: 80, reps: 7 }),
      makeSet({ id: 'set-2', workoutSessionId: 's1', exerciseId: 'ex-bench', loadKg: 100, reps: 3, orderIndex: 1 }),
      makeSet({ id: 'set-3', workoutSessionId: 's1', exerciseId: 'ex-bench', loadKg: 100, reps: 5, orderIndex: 2 }),
    ]
    const records = computeRecords({ sessions: [s1], exerciseSessions: [], sets, exercises: [bench] })
    const mostReps = byKind(records, 'mostRepsAtLoad')
    expect(mostReps?.value).toBe(5)
    expect(mostReps?.secondaryValue).toBe(100)
    expect(mostReps?.setLogId).toBe('set-3')
  })

  it('bestSessionVolume sums load × reps per session and skips sets with null load', () => {
    const bench = makeExercise({ id: 'ex-bench' })
    const s1 = makeSession({ id: 's1', startedAt: T, dateKey: '2026-07-01' })
    const s2 = makeSession({ id: 's2', startedAt: T2, dateKey: '2026-07-08' })
    const sets = [
      // s1: 3 × 60 × 8 = 1440
      makeSet({ id: 'a1', workoutSessionId: 's1', exerciseId: 'ex-bench', loadKg: 60, reps: 8 }),
      makeSet({ id: 'a2', workoutSessionId: 's1', exerciseId: 'ex-bench', loadKg: 60, reps: 8, orderIndex: 1 }),
      makeSet({ id: 'a3', workoutSessionId: 's1', exerciseId: 'ex-bench', loadKg: 60, reps: 8, orderIndex: 2 }),
      // s2: 4 × 80 × 5 = 1600, plus a null-load set that must be skipped
      makeSet({ id: 'b1', workoutSessionId: 's2', exerciseId: 'ex-bench', loadKg: 80, reps: 5, completedAt: T2 }),
      makeSet({ id: 'b2', workoutSessionId: 's2', exerciseId: 'ex-bench', loadKg: 80, reps: 5, orderIndex: 1, completedAt: T2 }),
      makeSet({ id: 'b3', workoutSessionId: 's2', exerciseId: 'ex-bench', loadKg: 80, reps: 5, orderIndex: 2, completedAt: T2 }),
      makeSet({ id: 'b4', workoutSessionId: 's2', exerciseId: 'ex-bench', loadKg: 80, reps: 5, orderIndex: 3, completedAt: T2 }),
      makeSet({ id: 'b5', workoutSessionId: 's2', exerciseId: 'ex-bench', loadKg: null, reps: 10, orderIndex: 4, completedAt: T2 }),
    ]
    const records = computeRecords({ sessions: [s1, s2], exerciseSessions: [], sets, exercises: [bench] })
    const volume = byKind(records, 'bestSessionVolume')
    expect(volume?.value).toBe(1600)
    expect(volume?.workoutSessionId).toBe('s2')
    expect(volume?.setLogId).toBeNull()
    expect(volume?.dateKey).toBe('2026-07-08')
  })

  it('keeps added-weight pull-up records separate from effective-load records', () => {
    const pullUp = makeExercise({ id: 'ex-pull-up', kind: 'bodyweight' })
    // Heavier body earlier: plain bodyweight set at 95 kg beats the later
    // added-weight set's 90 kg effective load, but only the added-weight set
    // can hold the external added-weight record.
    const s1 = makeSession({ id: 's1', bodyweightAtSessionKg: 95, startedAt: T, dateKey: '2026-07-01' })
    const s2 = makeSession({ id: 's2', bodyweightAtSessionKg: 85, startedAt: T2, dateKey: '2026-07-08' })
    const sets = [
      makeSet({ id: 'bw', workoutSessionId: 's1', exerciseId: 'ex-pull-up', bodyweightMode: 'bodyweight', reps: 10 }),
      makeSet({ id: 'added', workoutSessionId: 's2', exerciseId: 'ex-pull-up', bodyweightMode: 'added', addedWeightKg: 5, reps: 6, completedAt: T2 }),
    ]
    const records = computeRecords({ sessions: [s1, s2], exerciseSessions: [], sets, exercises: [pullUp] })

    const addedRecord = byKind(records, 'addedWeightPullup')
    expect(addedRecord?.value).toBe(5)
    expect(addedRecord?.secondaryValue).toBe(6)
    expect(addedRecord?.setLogId).toBe('added')

    const effective = byKind(records, 'heaviestEffectiveLoad')
    expect(effective?.value).toBe(95)
    expect(effective?.setLogId).toBe('bw')

    expect(byKind(records, 'bodyweightReps')?.value).toBe(10)
    // No raw-load record for a bodyweight exercise.
    expect(byKind(records, 'heaviestLoad')).toBeUndefined()
  })

  it('falls back to reps-only records when the session bodyweight snapshot is null', () => {
    const pullUp = makeExercise({ id: 'ex-pull-up', kind: 'bodyweight' })
    const s1 = makeSession({ id: 's1', bodyweightAtSessionKg: null })
    const sets = [
      makeSet({ id: 'bw', workoutSessionId: 's1', exerciseId: 'ex-pull-up', bodyweightMode: 'bodyweight', reps: 12 }),
    ]
    const records = computeRecords({ sessions: [s1], exerciseSessions: [], sets, exercises: [pullUp] })
    expect(byKind(records, 'bodyweightReps')?.value).toBe(12)
    expect(byKind(records, 'heaviestEffectiveLoad')).toBeUndefined()
    expect(byKind(records, 'best1RM')).toBeUndefined()
    expect(byKind(records, 'bestSet')).toBeUndefined()
    expect(byKind(records, 'bestSessionVolume')).toBeUndefined()
  })

  it('never merges records across variants or equipment contexts, including the null context', () => {
    const row = makeExercise({ id: 'ex-row' })
    const s1 = makeSession({ id: 's1' })
    const sets = [
      makeSet({ id: 'plain', workoutSessionId: 's1', exerciseId: 'ex-row', loadKg: 60, reps: 8 }),
      makeSet({ id: 'variant', workoutSessionId: 's1', exerciseId: 'ex-row', variantId: 'var-1', loadKg: 80, reps: 8, orderIndex: 1 }),
      makeSet({ id: 'machine', workoutSessionId: 's1', exerciseId: 'ex-row', equipmentContextId: 'ctx-1', loadKg: 100, reps: 8, orderIndex: 2 }),
    ]
    const records = computeRecords({ sessions: [s1], exerciseSessions: [], sets, exercises: [row] })
    const heaviest = records.filter((r) => r.kind === 'heaviestLoad')
    expect(heaviest).toHaveLength(3)
    const values = new Map(heaviest.map((r) => [`${r.variantId ?? ''}|${r.equipmentContextId ?? ''}`, r.value]))
    expect(values.get('|')).toBe(60)
    expect(values.get('var-1|')).toBe(80)
    expect(values.get('|ctx-1')).toBe(100)
    // Ids stay distinct per key so rebuild replaces rows one-to-one.
    expect(new Set(heaviest.map((r) => r.id)).size).toBe(3)
    expect(heaviest[0]?.id).toBe(personalRecordId('ex-row', null, null, 'heaviestLoad'))
  })

  it('excludes demo sets and sessions unless includeDemo is set', () => {
    const bench = makeExercise({ id: 'ex-bench' })
    const real = makeSession({ id: 's-real' })
    const demoSession = makeSession({ id: 's-demo', isDemo: true, startedAt: T2, dateKey: '2026-07-08' })
    const sets = [
      makeSet({ id: 'real-set', workoutSessionId: 's-real', exerciseId: 'ex-bench', loadKg: 100, reps: 5 }),
      makeSet({ id: 'demo-set', workoutSessionId: 's-demo', exerciseId: 'ex-bench', loadKg: 200, reps: 5, isDemo: true, completedAt: T2 }),
    ]
    const input = { sessions: [real, demoSession], exerciseSessions: [], sets, exercises: [bench] }

    const withoutDemo = computeRecords(input)
    expect(byKind(withoutDemo, 'heaviestLoad')?.value).toBe(100)
    expect(byKind(withoutDemo, 'heaviestLoad')?.isDemo).toBeUndefined()

    const withDemo = computeRecords({ ...input, includeDemo: true })
    expect(byKind(withDemo, 'heaviestLoad')?.value).toBe(200)
    expect(byKind(withDemo, 'heaviestLoad')?.isDemo).toBe(true)
  })

  it('ignores sets from discarded sessions', () => {
    const bench = makeExercise({ id: 'ex-bench' })
    const discarded = makeSession({ id: 's1', status: 'discarded' })
    const sets = [
      makeSet({ id: 'set-1', workoutSessionId: 's1', exerciseId: 'ex-bench', loadKg: 100, reps: 5 }),
    ]
    expect(computeRecords({ sessions: [discarded], exerciseSessions: [], sets, exercises: [bench] })).toEqual([])
  })

  it('a tie keeps the first achievement rather than moving the record to the repeat', () => {
    const bench = makeExercise({ id: 'ex-bench' })
    const s1 = makeSession({ id: 's1', startedAt: T, dateKey: '2026-07-01' })
    const s2 = makeSession({ id: 's2', startedAt: T2, dateKey: '2026-07-08' })
    const sets = [
      makeSet({ id: 'first', workoutSessionId: 's1', exerciseId: 'ex-bench', loadKg: 100, reps: 5 }),
      makeSet({ id: 'repeat', workoutSessionId: 's2', exerciseId: 'ex-bench', loadKg: 100, reps: 5, completedAt: T2 }),
    ]
    const records = computeRecords({ sessions: [s1, s2], exerciseSessions: [], sets, exercises: [bench] })
    expect(byKind(records, 'heaviestLoad')?.setLogId).toBe('first')
    expect(byKind(records, 'heaviestLoad')?.dateKey).toBe('2026-07-01')
  })
})

describe('detectNewRecords', () => {
  it('returns records that appeared or strictly improved, never ties', () => {
    const previous = [
      makePr({ kind: 'heaviestLoad', value: 100, exerciseId: 'ex-bench' }),
      makePr({ kind: 'bodyweightReps', value: 10, exerciseId: 'ex-pull-up' }),
    ]
    const current = [
      makePr({ kind: 'heaviestLoad', value: 102.5, exerciseId: 'ex-bench' }), // improved
      makePr({ kind: 'bodyweightReps', value: 10, exerciseId: 'ex-pull-up' }), // tie
      makePr({ kind: 'best1RM', value: 120, exerciseId: 'ex-bench' }), // appeared
    ]
    const fresh = detectNewRecords(previous, current)
    expect(fresh.map((r) => r.kind).sort()).toEqual(['best1RM', 'heaviestLoad'])
  })

  it('treats a heavier load with fewer reps as a new mostRepsAtLoad record', () => {
    const previous = [makePr({ kind: 'mostRepsAtLoad', value: 8, secondaryValue: 80 })]
    const heavier = [makePr({ kind: 'mostRepsAtLoad', value: 3, secondaryValue: 100 })]
    expect(detectNewRecords(previous, heavier)).toHaveLength(1)
    // Same load, more reps also improves; same load, same reps does not.
    const moreReps = [makePr({ kind: 'mostRepsAtLoad', value: 9, secondaryValue: 80 })]
    expect(detectNewRecords(previous, moreReps)).toHaveLength(1)
    expect(detectNewRecords(previous, previous)).toHaveLength(0)
  })

  it('breaks addedWeightPullup ties on external weight by reps', () => {
    const previous = [makePr({ kind: 'addedWeightPullup', value: 10, secondaryValue: 5 })]
    const moreReps = [makePr({ kind: 'addedWeightPullup', value: 10, secondaryValue: 7 })]
    expect(detectNewRecords(previous, moreReps)).toHaveLength(1)
    const fewerRepsHeavier = [makePr({ kind: 'addedWeightPullup', value: 12.5, secondaryValue: 3 })]
    expect(detectNewRecords(previous, fewerRepsHeavier)).toHaveLength(1)
    expect(detectNewRecords(previous, previous)).toHaveLength(0)
  })

  it('does not confuse identical kinds across different variants or contexts', () => {
    const previous = [makePr({ kind: 'heaviestLoad', value: 100, variantId: 'var-1' })]
    const current = [makePr({ kind: 'heaviestLoad', value: 60, variantId: null })]
    // Different key: it appeared, even though 60 < 100 on the other variant.
    expect(detectNewRecords(previous, current)).toHaveLength(1)
  })
})

describe('rebuildPersonalRecords', () => {
  it('replaces stale rows after a history edit', async () => {
    const gdb = new GymDB('test-' + crypto.randomUUID())
    try {
      await gdb.exercises.add(makeExercise({ id: 'ex-bench' }))
      await gdb.workoutSessions.add(makeSession({ id: 's1' }))
      await gdb.exerciseSessions.add(
        makeExerciseSession({ id: 'es-1', workoutSessionId: 's1', exerciseId: 'ex-bench' }),
      )
      await gdb.setLogs.add(
        makeSet({ id: 'set-1', workoutSessionId: 's1', exerciseId: 'ex-bench', exerciseSessionId: 'es-1', loadKg: 100, reps: 5 }),
      )

      const first = await rebuildPersonalRecords(gdb)
      expect(first.find((r) => r.kind === 'heaviestLoad')?.value).toBe(100)

      // A row that no longer derives from any source log must not survive.
      await gdb.personalRecords.add(
        makePr({ id: 'stale-row', kind: 'heaviestLoad', value: 999, exerciseId: 'ex-gone' }),
      )
      // History edit: the user corrects the logged load downward.
      await gdb.setLogs.update('set-1', { loadKg: 80 })

      const second = await rebuildPersonalRecords(gdb)
      const rows = await gdb.personalRecords.toArray()
      expect(rows).toHaveLength(second.length)
      expect(rows.find((r) => r.id === 'stale-row')).toBeUndefined()
      expect(rows.find((r) => r.kind === 'heaviestLoad')?.value).toBe(80)
      expect(rows.every((r) => r.exerciseId === 'ex-bench')).toBe(true)
    } finally {
      await gdb.delete()
    }
  })

  it('includes demo rows only when demo mode is enabled in settings', async () => {
    const gdb = new GymDB('test-' + crypto.randomUUID())
    try {
      await gdb.exercises.add(makeExercise({ id: 'ex-bench' }))
      await gdb.workoutSessions.add(makeSession({ id: 's-demo', isDemo: true }))
      await gdb.setLogs.add(
        makeSet({ id: 'demo-set', workoutSessionId: 's-demo', exerciseId: 'ex-bench', loadKg: 100, reps: 5, isDemo: true }),
      )

      // No settings row → demo mode off → no records.
      expect(await rebuildPersonalRecords(gdb)).toEqual([])
      expect(await gdb.personalRecords.count()).toBe(0)

      // computeRecords with includeDemo mirrors demoDataEnabled: verified via
      // the pure test above; here we only assert the db glue stays empty and
      // never fabricates rows from demo data while demo mode is off.
    } finally {
      await gdb.delete()
    }
  })
})
