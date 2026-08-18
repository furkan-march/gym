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
    const template = await db.workoutTemplates.get(TEMPLATE_IDS.pushA)
    expect(template).toBeDefined()
    const { session } = await startWorkout(template!)

    render(
      <MemoryRouter>
        <ActiveWorkoutScreen />
      </MemoryRouter>,
    )

    // Push-Up is first with incomplete sets → auto-expanded card.
    const bench = await screen.findAllByText('Push-Up')
    expect(bench.length).toBeGreaterThan(0)
    // Other template exercises render collapsed.
    expect(await screen.findByText('Lateral Raise')).toBeInTheDocument()

    // First session: no history → hint shown; exactly the 2 prescribed
    // working rows are created lazily.
    expect(await screen.findByText(/No history yet/)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Complete set' })).toHaveLength(2)
    })
    const checks = screen.getAllByRole('button', { name: 'Complete set' })

    // Required fields guard (SPEC 11): Push-Up is bodyweight, so only reps
    // are required — the check stays disabled until they are entered.
    expect(checks[0]!).toBeDisabled()
    fireEvent.change(screen.getByLabelText('set 1 reps'), { target: { value: '12' } })
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

    // …and the sticky bar reflects progress (Push A = 10 working sets).
    expect(await screen.findByText(/1 done · 9 left/)).toBeInTheDocument()
  })
})
