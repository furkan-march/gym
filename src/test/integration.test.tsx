import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../lib/db'
import { seedDefaults, TEMPLATE_IDS, EX } from '../lib/seed/seed'
import {
  addSet,
  completeSet,
  finishWorkout,
  getResumableSession,
  saveAndExit,
  startWorkout,
  activateSession,
} from '../lib/data/workouts'
import { upsertBodyMetric } from '../lib/data/daily'
import { recommend, type ComparableSessionInput } from '../lib/engines/progression'
import { exportBackup } from '../lib/backup/backup'
import HistoryScreen from '../ui/screens/History'
import type { Exercise, WorkoutTemplate } from '../lib/types'

/**
 * SPEC 35 COMPONENT OR INTEGRATION TESTS — the full core loop:
 * start scheduled workout -> choose another workout -> log & complete a set ->
 * resume -> finish -> appears in History -> next-session recommendation ->
 * backup export contains it all.
 */

async function freshDb() {
  await db.delete()
  await db.open()
  await seedDefaults()
}

async function getTemplate(id: string): Promise<WorkoutTemplate> {
  const t = await db.workoutTemplates.get(id)
  if (!t) throw new Error('template missing')
  return t
}

async function getExercise(id: string): Promise<Exercise> {
  const e = await db.exercises.get(id)
  if (!e) throw new Error('exercise missing')
  return e
}

/** Complete all prescribed working sets of one exercise session at a load/reps. */
async function completeAllSets(
  esId: string,
  exerciseId: string,
  loadKg: number,
  reps: number,
  rir: number,
) {
  const es = await db.exerciseSessions.get(esId)
  const exercise = await getExercise(exerciseId)
  if (!es) throw new Error('es missing')
  for (let i = 0; i < es.prescription.prescribedSets; i++) {
    const set = await addSet(es, exercise, { loadKg, reps, rir })
    await completeSet(set.id, { loadKg, reps, rir })
  }
}

describe('core loop integration (SPEC 35/36)', () => {
  beforeEach(freshDb)

  it('start -> log -> save&exit -> resume -> finish -> History -> recommendation -> backup', async () => {
    await upsertBodyMetric('2026-08-01', { weightKg: 87 })

    // 1. Start the Legs A workout (Wednesday in the 6-day schedule).
    const lower = await getTemplate(TEMPLATE_IDS.legsA)
    const { session, exerciseSessions } = await startWorkout(lower)
    expect(session.templateKind).toBe('lower')
    expect(session.bodyweightAtSessionKg).toBe(87) // snapshot, SPEC 15/29
    expect(exerciseSessions.length).toBe(3)

    // 2. Log and complete squat sets (4 x 6 @ 80 kg, RIR 2).
    const squatEs = exerciseSessions.find((e) => e.exerciseId === EX.smithSquat)
    expect(squatEs).toBeDefined()
    await completeAllSets(squatEs!.id, EX.smithSquat, 80, 6, 2)

    // 3. Save & exit freezes the session; it is resumable afterwards.
    await saveAndExit(session.id)
    const frozen = await db.workoutSessions.get(session.id)
    expect(frozen?.lastActivatedAt).toBeNull()
    const resumable = await getResumableSession()
    expect(resumable?.id).toBe(session.id)
    await activateSession(session.id)

    // 4. Finish. Squat completed, untouched exercises marked skipped.
    await finishWorkout(session.id)
    const done = await db.workoutSessions.get(session.id)
    expect(done?.status).toBe('completed')
    expect(done?.finishedAt).not.toBeNull()
    const doneEs = await db.exerciseSessions.where('workoutSessionId').equals(session.id).toArray()
    expect(doneEs.find((e) => e.id === squatEs!.id)?.status).toBe('completed')
    expect(doneEs.filter((e) => e.status === 'skipped').length).toBeGreaterThan(0)
    expect((await db.activeWorkoutState.get('active'))?.workoutSessionId).toBeNull()

    // 5. The workout appears in History.
    render(
      <MemoryRouter>
        <HistoryScreen />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/Legs A/)).toBeInTheDocument()

    // 6. Next-session recommendation from the comparable session explains itself.
    const setLogs = await db.setLogs.where('workoutSessionId').equals(session.id).toArray()
    const history: ComparableSessionInput[] = [
      { session: done!, exerciseSession: doneEs.find((e) => e.id === squatEs!.id)!, sets: setLogs, feedback: null },
    ]
    const squat = await getExercise(EX.smithSquat)
    const rec = recommend({
      exercise: squat,
      templateExercise: null,
      currentPrescription: squatEs!.prescription,
      history,
      variantId: null,
      equipmentContextId: null,
    })
    // 4x6 @ RIR 2 is below the top of the 6-8 range: maintain and add reps.
    expect(rec.kind).toBe('maintain')
    expect(rec.explanation).toMatch(/80/)
    expect(rec.sourceSessionId).toBe(session.id)

    // 7. Backup export contains the session, its sets, and the profile.
    const backup = await exportBackup(db)
    expect(backup.data.workoutSessions.some((s) => s.id === session.id)).toBe(true)
    expect(backup.data.setLogs.length).toBe(setLogs.length)
    expect(backup.data.userProfile[0]?.name).toBe('Furkan')
  })

  it('choosing another workout starts any template without touching the schedule', async () => {
    const upperA = await getTemplate(TEMPLATE_IDS.pushA)
    const { session } = await startWorkout(upperA)
    expect(session.templateName).toBe('Push A')
    const days = await db.scheduledDays.toArray()
    // Monday still points at Pull A and Sunday stays rest — off-schedule starts change nothing.
    expect(days.find((d) => d.weekday === 1)?.templateId).toBe(TEMPLATE_IDS.pullA)
    expect(days.find((d) => d.weekday === 0)?.planKind).toBe('rest')
  })

  it('top-of-range squat session earns a load-increase recommendation', async () => {
    await upsertBodyMetric('2026-08-01', { weightKg: 87 })
    const lower = await getTemplate(TEMPLATE_IDS.legsA)
    const { session, exerciseSessions } = await startWorkout(lower)
    const squatEs = exerciseSessions.find((e) => e.exerciseId === EX.smithSquat)!
    await completeAllSets(squatEs.id, EX.smithSquat, 80, 8, 2) // 4x8 = top of range
    await finishWorkout(session.id)

    const done = await db.workoutSessions.get(session.id)
    const doneEs = await db.exerciseSessions.get(squatEs.id)
    const sets = await db.setLogs.where('workoutSessionId').equals(session.id).toArray()
    const squat = await getExercise(EX.smithSquat)
    const rec = recommend({
      exercise: squat,
      templateExercise: null,
      currentPrescription: squatEs.prescription,
      history: [{ session: done!, exerciseSession: doneEs!, sets, feedback: null }],
      variantId: null,
      equipmentContextId: null,
    })
    expect(rec.kind).toBe('increase')
    expect(rec.suggestedLoadKg).toBe(82.5) // 80 + 2.5 increment
    expect(rec.explanation.length).toBeGreaterThan(10) // explains its reasoning
  })
})
