import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { format } from 'date-fns'
import { db } from '../../../lib/db'
import { toDateKey } from '../../../lib/dates'
import { EX, TEMPLATE_IDS, seedDefaults } from '../../../lib/seed/seed'
import type { SetLog, WorkoutSession } from '../../../lib/types'
import HistoryScreen from '../History'

/**
 * Calendar tab (SPEC 39, V2 item 1): one completed Upper A session dated today
 * appears in the current-month grid; tapping the day opens the summary sheet
 * with the template name and completed working-set count.
 */

const NOW = new Date()
const TODAY_KEY = toDateKey(NOW)
const T = NOW.toISOString()
const SESSION_ID = 'ws-calendar-test'

function makeSession(): WorkoutSession {
  return {
    id: SESSION_ID,
    templateId: TEMPLATE_IDS.upperA,
    templateName: 'Upper A',
    templateKind: 'upperA',
    dateKey: TODAY_KEY,
    startedAt: T,
    finishedAt: T,
    status: 'completed',
    bodyweightAtSessionKg: 87,
    activeSeconds: 3600,
    lastActivatedAt: null,
    createdAt: T,
    updatedAt: T,
  }
}

function makeSet(index: number): SetLog {
  return {
    id: `set-calendar-test-${index}`,
    workoutSessionId: SESSION_ID,
    exerciseSessionId: 'es-calendar-test',
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
  await db.setLogs.bulkAdd([makeSet(0), makeSet(1)])
})

describe('CalendarTab', () => {
  it('shows the current month and a day summary sheet on tap', async () => {
    render(
      <MemoryRouter>
        <HistoryScreen />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByText('Calendar'))

    // Month title defaults to the current month.
    expect(await screen.findByText(format(NOW, 'MMMM yyyy'))).toBeInTheDocument()

    // Today's cell carries an accessible full-date label; tapping it opens the
    // read-only summary sheet with the workout name and completed set count.
    fireEvent.click(await screen.findByRole('button', { name: format(NOW, 'd MMMM yyyy') }))
    expect(await screen.findByText('Upper A')).toBeInTheDocument()
    expect(await screen.findByText('2 sets')).toBeInTheDocument()
  })
})
