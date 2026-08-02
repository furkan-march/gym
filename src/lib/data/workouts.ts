import { db } from '../db'
import { toDateKey } from '../dates'
import { newId, nowIso } from '../ids'
import type {
  Exercise,
  ExerciseSession,
  PrescriptionSnapshot,
  SetLog,
  TemplateExercise,
  WorkoutSession,
  WorkoutTemplate,
} from '../types'

/**
 * Workout lifecycle data-access layer (SPEC 11, 29). All writes to session
 * data go through here (keeps a future sync layer insertable, SPEC 39).
 *
 * Invariants enforced here:
 * - Prescription and bodyweight are SNAPSHOTTED at session start.
 * - dateKey = local date of start; never changes on resume/finish.
 * - activeSeconds accumulates only while the session is activated.
 * - Substitution creates a new ExerciseSession and preserves the original.
 */

function snapshotPrescription(tex: TemplateExercise, exercise: Exercise): PrescriptionSnapshot {
  return {
    prescribedSets: tex.prescribedSets,
    repRangeMin: tex.repRangeMin,
    repRangeMax: tex.repRangeMax,
    targetRIRMin: tex.targetRIRMin,
    targetRIRMax: tex.targetRIRMax,
    restSeconds: tex.restSeconds,
    incrementKg: tex.incrementKg ?? exercise.defaultIncrementKg,
    isOptional: tex.isOptional,
    supersetGroup: tex.supersetGroup,
  }
}

export function defaultPrescription(exercise: Exercise): PrescriptionSnapshot {
  return {
    prescribedSets: 3,
    repRangeMin: 8,
    repRangeMax: 10,
    targetRIRMin: 1,
    targetRIRMax: 2,
    restSeconds: 120,
    incrementKg: exercise.defaultIncrementKg,
    isOptional: false,
    supersetGroup: null,
  }
}

async function latestBodyweightKg(): Promise<number | null> {
  const metrics = await db.bodyMetrics.orderBy('dateKey').reverse().toArray()
  for (const m of metrics) if (m.weightKg != null) return m.weightKg
  return null
}

export interface StartedWorkout {
  session: WorkoutSession
  exerciseSessions: ExerciseSession[]
}

export async function startWorkout(
  template: WorkoutTemplate | null,
  now: Date = new Date(),
): Promise<StartedWorkout> {
  const t = nowIso()
  const bodyweight = await latestBodyweightKg()

  const session: WorkoutSession = {
    id: newId(),
    templateId: template?.id ?? null,
    templateName: template?.name ?? 'Custom workout',
    templateKind: template?.kind ?? 'custom',
    dateKey: toDateKey(now),
    startedAt: t,
    finishedAt: null,
    status: 'active',
    bodyweightAtSessionKg: bodyweight,
    activeSeconds: 0,
    lastActivatedAt: t,
    createdAt: t,
    updatedAt: t,
  }

  let exerciseSessions: ExerciseSession[] = []
  if (template) {
    const texs = (await db.templateExercises.where('templateId').equals(template.id).toArray()).sort(
      (a, b) => a.orderIndex - b.orderIndex,
    )
    const exercises = await db.exercises.bulkGet(texs.map((x) => x.exerciseId))
    const variantsById = new Map(
      (await db.exerciseVariants.toArray()).map((v) => [v.id, v] as const),
    )
    exerciseSessions = texs.flatMap((tex, i) => {
      const exercise = exercises[i]
      if (!exercise) return []
      const variant = tex.defaultVariantId ? (variantsById.get(tex.defaultVariantId) ?? null) : null
      const es: ExerciseSession = {
        id: newId(),
        workoutSessionId: session.id,
        exerciseId: exercise.id,
        variantId: variant?.id ?? null,
        equipmentContextId: null,
        exerciseName: exercise.name,
        variantName: variant?.name ?? null,
        status: 'pending',
        orderIndex: tex.orderIndex,
        isUnplanned: false,
        substitutedByExerciseSessionId: null,
        substitutedFromExerciseSessionId: null,
        prescription: snapshotPrescription(tex, exercise),
        createdAt: t,
        updatedAt: t,
      }
      return [es]
    })
  }

  await db.transaction('rw', [db.workoutSessions, db.exerciseSessions, db.activeWorkoutState], async () => {
    await db.workoutSessions.add(session)
    if (exerciseSessions.length) await db.exerciseSessions.bulkAdd(exerciseSessions)
    await db.activeWorkoutState.put({
      id: 'active',
      workoutSessionId: session.id,
      currentExerciseSessionId: exerciseSessions[0]?.id ?? null,
      updatedAt: t,
    })
  })

  return { session, exerciseSessions }
}

/** Freeze active-time accumulation (save-and-exit, app hidden). */
export async function freezeSession(sessionId: string, now: Date = new Date()): Promise<void> {
  const s = await db.workoutSessions.get(sessionId)
  if (!s || s.status !== 'active' || s.lastActivatedAt == null) return
  const delta = Math.max(0, Math.round((now.getTime() - new Date(s.lastActivatedAt).getTime()) / 1000))
  await db.workoutSessions.update(sessionId, {
    activeSeconds: s.activeSeconds + delta,
    lastActivatedAt: null,
    updatedAt: nowIso(),
  })
}

/** Resume active-time accumulation (reopen, app visible again). */
export async function activateSession(sessionId: string, now: Date = new Date()): Promise<void> {
  const s = await db.workoutSessions.get(sessionId)
  if (!s || s.status !== 'active' || s.lastActivatedAt != null) return
  await db.workoutSessions.update(sessionId, {
    lastActivatedAt: now.toISOString(),
    updatedAt: nowIso(),
  })
}

export async function saveAndExit(sessionId: string, now: Date = new Date()): Promise<void> {
  await freezeSession(sessionId, now)
}

/**
 * Finish: freeze time, mark statuses, clear active pointer. Exercises with all
 * prescribed working sets completed become 'completed'; with some sets
 * 'completed'; untouched non-skipped ones become 'skipped'.
 */
export async function finishWorkout(sessionId: string, now: Date = new Date()): Promise<void> {
  await freezeSession(sessionId, now)
  const t = nowIso()
  const ess = await db.exerciseSessions.where('workoutSessionId').equals(sessionId).toArray()
  const sets = await db.setLogs.where('workoutSessionId').equals(sessionId).toArray()

  await db.transaction('rw', [db.workoutSessions, db.exerciseSessions, db.activeWorkoutState, db.restTimerState], async () => {
    for (const es of ess) {
      if (es.status === 'skipped' || es.status === 'substituted') continue
      const done = sets.filter(
        (x) => x.exerciseSessionId === es.id && x.completed && !x.isWarmup,
      ).length
      await db.exerciseSessions.update(es.id, {
        status: done > 0 ? 'completed' : 'skipped',
        updatedAt: t,
      })
    }
    await db.workoutSessions.update(sessionId, {
      status: 'completed',
      finishedAt: t,
      updatedAt: t,
    })
    await db.activeWorkoutState.put({ id: 'active', workoutSessionId: null, currentExerciseSessionId: null, updatedAt: t })
    await db.restTimerState.put({ id: 'rest', endsAt: null, durationSeconds: 0, pausedRemainingSeconds: null, forExerciseSessionId: null, updatedAt: t })
  })
}

export async function discardWorkout(sessionId: string): Promise<void> {
  const t = nowIso()
  await db.transaction('rw', [db.workoutSessions, db.exerciseSessions, db.setLogs, db.activeWorkoutState, db.restTimerState], async () => {
    await db.setLogs.where('workoutSessionId').equals(sessionId).delete()
    await db.exerciseSessions.where('workoutSessionId').equals(sessionId).delete()
    await db.workoutSessions.delete(sessionId)
    await db.activeWorkoutState.put({ id: 'active', workoutSessionId: null, currentExerciseSessionId: null, updatedAt: t })
    await db.restTimerState.put({ id: 'rest', endsAt: null, durationSeconds: 0, pausedRemainingSeconds: null, forExerciseSessionId: null, updatedAt: t })
  })
}

export async function getResumableSession(): Promise<WorkoutSession | null> {
  const state = await db.activeWorkoutState.get('active')
  if (!state?.workoutSessionId) return null
  const s = await db.workoutSessions.get(state.workoutSessionId)
  return s && s.status === 'active' ? s : null
}

export async function skipExercise(exerciseSessionId: string): Promise<void> {
  await db.exerciseSessions.update(exerciseSessionId, { status: 'skipped', updatedAt: nowIso() })
}

export async function unskipExercise(exerciseSessionId: string): Promise<void> {
  await db.exerciseSessions.update(exerciseSessionId, { status: 'pending', updatedAt: nowIso() })
}

/** Substitute preserving earlier data (SPEC 11/29): new ES linked both ways. */
export async function substituteExercise(
  originalId: string,
  replacement: Exercise,
  variantId: string | null,
): Promise<ExerciseSession> {
  const original = await db.exerciseSessions.get(originalId)
  if (!original) throw new Error('Exercise session not found')
  const t = nowIso()
  const variant = variantId ? await db.exerciseVariants.get(variantId) : null
  const replacementEs: ExerciseSession = {
    id: newId(),
    workoutSessionId: original.workoutSessionId,
    exerciseId: replacement.id,
    variantId: variant?.id ?? null,
    equipmentContextId: null,
    exerciseName: replacement.name,
    variantName: variant?.name ?? null,
    status: 'pending',
    orderIndex: original.orderIndex,
    isUnplanned: false,
    substitutedByExerciseSessionId: null,
    substitutedFromExerciseSessionId: original.id,
    prescription: { ...original.prescription, incrementKg: replacement.defaultIncrementKg },
    createdAt: t,
    updatedAt: t,
  }
  await db.transaction('rw', [db.exerciseSessions], async () => {
    await db.exerciseSessions.add(replacementEs)
    await db.exerciseSessions.update(original.id, {
      status: 'substituted',
      substitutedByExerciseSessionId: replacementEs.id,
      updatedAt: t,
    })
  })
  return replacementEs
}

export async function addUnplannedExercise(
  sessionId: string,
  exercise: Exercise,
  variantId: string | null,
): Promise<ExerciseSession> {
  const t = nowIso()
  const existing = await db.exerciseSessions.where('workoutSessionId').equals(sessionId).toArray()
  const variant = variantId ? await db.exerciseVariants.get(variantId) : null
  const es: ExerciseSession = {
    id: newId(),
    workoutSessionId: sessionId,
    exerciseId: exercise.id,
    variantId: variant?.id ?? null,
    equipmentContextId: null,
    exerciseName: exercise.name,
    variantName: variant?.name ?? null,
    status: 'pending',
    orderIndex: existing.length ? Math.max(...existing.map((x) => x.orderIndex)) + 1 : 0,
    isUnplanned: true,
    substitutedByExerciseSessionId: null,
    substitutedFromExerciseSessionId: null,
    prescription: defaultPrescription(exercise),
    createdAt: t,
    updatedAt: t,
  }
  await db.exerciseSessions.add(es)
  return es
}

export async function reorderExercises(orderedIds: string[]): Promise<void> {
  const t = nowIso()
  await db.transaction('rw', [db.exerciseSessions], async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i]
      if (id) await db.exerciseSessions.update(id, { orderIndex: i, updatedAt: t })
    }
  })
}

// ---------------------------------------------------------------------------
// Set logging
// ---------------------------------------------------------------------------

export interface NewSetInput {
  loadKg?: number | null
  reps?: number | null
  rir?: number | null
  isWarmup?: boolean
  side?: SetLog['side']
  bodyweightMode?: SetLog['bodyweightMode']
  addedWeightKg?: number | null
  assistanceWeightKg?: number | null
}

export async function addSet(es: ExerciseSession, exercise: Exercise, input: NewSetInput): Promise<SetLog> {
  const t = nowIso()
  const existing = await db.setLogs.where('exerciseSessionId').equals(es.id).toArray()
  const set: SetLog = {
    id: newId(),
    workoutSessionId: es.workoutSessionId,
    exerciseSessionId: es.id,
    exerciseId: es.exerciseId,
    variantId: es.variantId,
    equipmentContextId: es.equipmentContextId,
    loadKg: input.loadKg ?? null,
    reps: input.reps ?? null,
    rir: input.rir ?? null,
    completed: false,
    isWarmup: input.isWarmup ?? false,
    side: input.side ?? null,
    bodyweightMode:
      input.bodyweightMode ?? (exercise.kind === 'bodyweight' ? 'bodyweight' : 'none'),
    addedWeightKg: input.addedWeightKg ?? null,
    assistanceWeightKg: input.assistanceWeightKg ?? null,
    loadConvention: exercise.loadConvention,
    orderIndex: existing.length ? Math.max(...existing.map((x) => x.orderIndex)) + 1 : 0,
    completedAt: null,
    formQuality: null,
    painFlag: false,
    createdAt: t,
    updatedAt: t,
  }
  await db.setLogs.add(set)
  if (es.status === 'pending') {
    await db.exerciseSessions.update(es.id, { status: 'inProgress', updatedAt: t })
  }
  return set
}

export async function updateSet(id: string, patch: Partial<SetLog>): Promise<void> {
  await db.setLogs.update(id, { ...patch, updatedAt: nowIso() })
}

/** One-tap completion: stamps completedAt; rest-timer start is the caller's job. */
export async function completeSet(
  id: string,
  values: { loadKg?: number | null; reps?: number | null; rir?: number | null },
  now: Date = new Date(),
): Promise<void> {
  await db.setLogs.update(id, {
    ...values,
    completed: true,
    completedAt: now.toISOString(),
    updatedAt: nowIso(),
  })
}

export async function uncompleteSet(id: string): Promise<void> {
  await db.setLogs.update(id, { completed: false, completedAt: null, updatedAt: nowIso() })
}

export async function deleteSet(id: string): Promise<void> {
  await db.setLogs.delete(id)
}

export async function duplicateSet(id: string): Promise<SetLog | null> {
  const src = await db.setLogs.get(id)
  if (!src) return null
  const t = nowIso()
  const existing = await db.setLogs.where('exerciseSessionId').equals(src.exerciseSessionId).toArray()
  const copy: SetLog = {
    ...src,
    id: newId(),
    completed: false,
    completedAt: null,
    orderIndex: Math.max(...existing.map((x) => x.orderIndex)) + 1,
    createdAt: t,
    updatedAt: t,
  }
  await db.setLogs.add(copy)
  return copy
}
