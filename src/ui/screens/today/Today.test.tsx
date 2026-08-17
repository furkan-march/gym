import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { format } from 'date-fns'
import { db } from '../../../lib/db'
import { seedDefaults } from '../../../lib/seed/seed'
import TodayScreen from '../Today'

/**
 * Smoke test on the seeded db. Nothing is injected — the real current date
 * decides which plan renders, so assertions stick to template-agnostic
 * strings that appear on every weekday.
 */

beforeEach(async () => {
  localStorage.clear()
  await db.delete()
  await db.open()
  await seedDefaults()
})

function renderToday() {
  return render(
    <MemoryRouter>
      <TodayScreen />
    </MemoryRouter>,
  )
}

describe('TodayScreen', () => {
  it('renders the day title area, secondary action, metric strip, and nutrition log', async () => {
    renderToday()

    // Secondary action is present on every weekday (SPEC 7).
    expect(await screen.findByText('Choose another workout')).toBeInTheDocument()

    // The date line under the day title always uses the local calendar date.
    expect(screen.getByText(format(new Date(), 'EEEE d MMMM'))).toBeInTheDocument()

    // Compact metric strip and quick logs render on every weekday.
    expect(await screen.findByText('Steps')).toBeInTheDocument()
    expect(await screen.findByText('Weight')).toBeInTheDocument()
    expect(await screen.findByText('Nutrition today')).toBeInTheDocument()
    expect(screen.getByText('This week')).toBeInTheDocument()

    // First-run: no completed workout exists, so the explainer card shows.
    expect(screen.getByText('Starting fresh')).toBeInTheDocument()
  })

  it('lists every seeded template in the Choose another workout sheet', async () => {
    const user = userEvent.setup()
    renderToday()

    await user.click(await screen.findByText('Choose another workout'))

    // Today's heading may repeat one template name, so assert presence, not uniqueness.
    for (const name of ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B']) {
      expect((await screen.findAllByText(name)).length).toBeGreaterThan(0)
    }
  })
})
