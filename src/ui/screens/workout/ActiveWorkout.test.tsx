import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../../../lib/db'
import { seedDefaults, TEMPLATE_IDS } from '../../../lib/seed/seed'
import { startWorkout } from '../../../lib/data/workouts'
import ActiveWorkoutScreen from '../ActiveWorkout'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await seedDefaults()
})

describe('ActiveWorkoutScreen', () => {
  it('renders the active session, lazily creates set rows, and one tap completes a set', async () => {
    const template = await db.workoutTemplates.get(TEMPLATE_IDS.upperA)
    expect(template).toBeDefined()
    const { session } = await startWorkout(template!)

    render(
      <MemoryRouter>
        <ActiveWorkoutScreen />
      </MemoryRouter>,
    )

    // Bench Press is first with incomplete sets → auto-expanded card.
    const bench = await screen.findAllByText('Bench Press')
    expect(bench.length).toBeGreaterThan(0)
    // Other template exercises render collapsed.
    expect(await screen.findByText('Pull-Up')).toBeInTheDocument()

    // First session: no history → hint shown, no ramp rows (load unknown),
    // exactly the 4 prescribed working rows are created lazily.
    expect(await screen.findByText(/No history yet/)).toBeInTheDocument()
    // Row creation is sequential; wait until all four rows exist.
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Complete set' })).toHaveLength(4)
    })
    const checks = screen.getAllByRole('button', { name: 'Complete set' })

    // Required fields guard (SPEC 11): the check is disabled while load and
    // reps are empty on a first-session weighted exercise.
    expect(checks[0]!).toBeDisabled()
    fireEvent.change(screen.getByLabelText('set 1 load'), { target: { value: '60' } })
    fireEvent.change(screen.getByLabelText('set 1 reps'), { target: { value: '8' } })
    await waitFor(() => expect(checks[0]!).toBeEnabled())

    // One tap on the check completes the set…
    fireEvent.click(checks[0]!)
    await waitFor(async () => {
      const logged = await db.setLogs
        .where('workoutSessionId')
        .equals(session.id)
        .toArray()
      expect(logged.filter((s) => s.completed)).toHaveLength(1)
      expect(logged.filter((s) => s.isWarmup)).toHaveLength(0)
    })

    // …starts the rest timer (autoStartRestTimer is seeded on)…
    await waitFor(async () => {
      const timer = await db.restTimerState.get('rest')
      expect(timer?.endsAt).toBeTruthy()
    })
    expect(
      await screen.findByRole('button', { name: 'Add 30 seconds' }),
    ).toBeInTheDocument()

    // …and the sticky bar reflects progress (Upper A = 24 working sets).
    expect(await screen.findByText(/1 done · 23 left/)).toBeInTheDocument()
  })
})
