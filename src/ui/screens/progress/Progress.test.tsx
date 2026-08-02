import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../../../lib/db'
import { addDaysKey, toDateKey } from '../../../lib/dates'
import { seedDefaults } from '../../../lib/seed/seed'
import ProgressScreen from '../Progress'

/**
 * Smoke test: with three recent weigh-ins the Weight stat tile shows their
 * 7-day average and the body-weight chart card renders with its legend.
 */

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

const T = '2026-08-01T08:00:00.000Z'
const todayKey = toDateKey(new Date())

beforeEach(async () => {
  await db.delete()
  await db.open()
  await seedDefaults()
  // Three weigh-ins inside the trailing 7-day window -> 7-day avg = 86.7 kg.
  await db.bodyMetrics.bulkAdd([
    {
      id: 'bm-test-1',
      dateKey: addDaysKey(todayKey, -3),
      weightKg: 86.9,
      waistCm: 90,
      bodyFatPct: null,
      createdAt: T,
      updatedAt: T,
    },
    {
      id: 'bm-test-2',
      dateKey: addDaysKey(todayKey, -2),
      weightKg: 86.7,
      waistCm: null,
      bodyFatPct: null,
      createdAt: T,
      updatedAt: T,
    },
    {
      id: 'bm-test-3',
      dateKey: addDaysKey(todayKey, -1),
      weightKg: 86.5,
      waistCm: 89.5,
      bodyFatPct: 17.5,
      createdAt: T,
      updatedAt: T,
    },
  ])
})

describe('ProgressScreen', () => {
  it('shows the 7-day average weight tile and the body-weight chart card', async () => {
    render(
      <MemoryRouter>
        <ProgressScreen />
      </MemoryRouter>,
    )

    // Stat tile: mean of 86.9 / 86.7 / 86.5 = 86.7 kg.
    expect(await screen.findByText('86.7 kg')).toBeInTheDocument()

    // Body-fat tile picks up the newest logged estimate.
    expect(await screen.findByText('17.5%')).toBeInTheDocument()

    // Body-weight chart card with its two-series legend (SPEC 19).
    expect(await screen.findByText('Body weight')).toBeInTheDocument()
    expect(await screen.findByText('Daily weigh-in')).toBeInTheDocument()

    // "7-day average" appears on both the stat-tile hint and the chart legend.
    expect((await screen.findAllByText('7-day average')).length).toBeGreaterThanOrEqual(2)

    // Waist chart renders too (two waist entries exist).
    expect(await screen.findByText('Waist')).toBeInTheDocument()

    // Body-fat chart (V2): only one bodyFatPct entry -> empty state.
    expect(await screen.findByText('Not enough body-fat entries yet')).toBeInTheDocument()

    // Personal records empty state (no workouts logged yet, SPEC 33).
    expect(await screen.findByText('No personal records yet')).toBeInTheDocument()
  })

  it('shows adherence-chart empty states while the program is fresh', async () => {
    // Program started today: every fully completed week predates it, so both
    // Consistency charts (V2) fall back to their empty states.
    await db.userProfile.update('profile', { programStartDateKey: todayKey })

    render(
      <MemoryRouter>
        <ProgressScreen />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Consistency')).toBeInTheDocument()
    expect(await screen.findAllByText('Not enough completed weeks yet')).toHaveLength(2)
  })

  it('renders body-fat and weekly adherence charts once history exists', async () => {
    // Four weeks into the program: at least two fully completed weeks exist
    // for both adherence charts (scheduled strength days and required posture
    // days come from the seed defaults).
    await db.userProfile.update('profile', { programStartDateKey: addDaysKey(todayKey, -28) })
    // A second body-fat estimate makes the trend chartable.
    await db.bodyMetrics.update('bm-test-1', { bodyFatPct: 18.2 })

    render(
      <MemoryRouter>
        <ProgressScreen />
      </MemoryRouter>,
    )

    // Chart subtitles only render in the non-empty branch.
    expect(await screen.findByText('% · estimate')).toBeInTheDocument()
    expect(await screen.findAllByText('% · week starting')).toHaveLength(2)
    expect(screen.queryByText('Not enough completed weeks yet')).not.toBeInTheDocument()
    expect(screen.queryByText('Not enough body-fat entries yet')).not.toBeInTheDocument()
  })
})
