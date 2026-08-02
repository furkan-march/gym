import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../../../lib/db'
import { EX, TEMPLATE_IDS, seedDefaults } from '../../../lib/seed/seed'
import type { ExerciseSession, SetLog, WorkoutSession } from '../../../lib/types'
import HistoryScreen from '../History'

/**
 * Smoke test: one completed Upper A session with three completed bench sets
 * (60 kg × 8) renders as a history card showing the template name and the
 * total valid volume (60 × 8 × 3 = 1,440 kg).
 */

const T = '2026-07-28T10:00:00.000Z'
const SESSION_ID = 'ws-history-test'
const ES_ID = 'es-history-test'

function makeSession(): WorkoutSession {
  return {
    id: SESSION_ID,
    templateId: TEMPLATE_IDS.upperA,
    templateName: 'Upper A',
    templateKind: 'upperA',
    dateKey: '2026-07-28',
    startedAt: T,
    finishedAt: '2026-07-28T11:02:00.000Z',
    status: 'completed',
    bodyweightAtSessionKg: 87,
    activeSeconds: 3480,
    lastActivatedAt: null,
    notes: 'Solid session.',
    createdAt: T,
    updatedAt: T,
  }
}

function makeExerciseSession(): ExerciseSession {
  return {
    id: ES_ID,
    workoutSessionId: SESSION_ID,
    exerciseId: EX.benchPress,
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
      repRangeMin: 8,
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

function makeSet(index: number): SetLog {
  return {
    id: `set-history-test-${index}`,
    workoutSessionId: SESSION_ID,
    exerciseSessionId: ES_ID,
    exerciseId: EX.benchPress,
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
    orderIndex: index,
    completedAt: T,
    formQuality: null,
    painFlag: false,
    createdAt: T,
    updatedAt: T,
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  await seedDefaults()
  await db.workoutSessions.add(makeSession())
  await db.exerciseSessions.add(makeExerciseSession())
  await db.setLogs.bulkAdd([makeSet(0), makeSet(1), makeSet(2)])
})

describe('HistoryScreen', () => {
  it('lists a completed workout with its template name and total valid volume', async () => {
    render(
      <MemoryRouter>
        <HistoryScreen />
      </MemoryRouter>,
    )

    // Template name on the session card (may also appear as a filter chip).
    const titles = await screen.findAllByText('Upper A')
    expect(titles.length).toBeGreaterThanOrEqual(1)

    // 3 completed working sets × 60 kg × 8 reps = 1,440 kg valid volume.
    expect(await screen.findByText('1,440 kg')).toBeInTheDocument()

    // Duration from activeSeconds (3480 s → 58 min) and set count.
    expect(await screen.findByText('58 min')).toBeInTheDocument()
    expect(await screen.findByText('3 sets')).toBeInTheDocument()

    // Note indicator for the session note.
    expect(await screen.findByText('Note')).toBeInTheDocument()
  })
})
