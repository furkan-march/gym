import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { toDateKey } from '../../../lib/dates'
import { db } from '../../../lib/db'
import { seedDefaults } from '../../../lib/seed/seed'
import { SupplementsCard } from '../today/SupplementsCard'
import { SupplementsSection } from './SupplementsSection'

/**
 * V2 supplement checklist (SPEC 39 item 4): seeded disabled; these tests flip
 * the flag directly in the db, then exercise the Settings editor and the
 * Today card's per-day SupplementLog upsert.
 */

beforeEach(async () => {
  await db.delete()
  await db.open()
  await seedDefaults()
  await db.appSettings.update('settings', { supplementsEnabled: true })
})

describe('SupplementsSection', () => {
  it('shows the seeded editable list and neutral footnote when enabled', async () => {
    const settings = await db.appSettings.get('settings')
    if (!settings) throw new Error('settings row missing after seed')

    render(
      <MemoryRouter>
        <SupplementsSection settings={settings} />
      </MemoryRouter>,
    )

    // Seeded creatine row appears as an editable name input, with its
    // editable reminder note beside it.
    expect(await screen.findByDisplayValue('Creatine')).toBeInTheDocument()
    expect(screen.getByDisplayValue('3–5 g daily (editable reminder)')).toBeInTheDocument()
    expect(
      screen.getByText('A personal checklist — this app makes no claims about supplements.'),
    ).toBeInTheDocument()
  })

  it('renders only the master toggle while the checklist is disabled', async () => {
    await db.appSettings.update('settings', { supplementsEnabled: false })
    const settings = await db.appSettings.get('settings')
    if (!settings) throw new Error('settings row missing after seed')

    render(
      <MemoryRouter>
        <SupplementsSection settings={settings} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('switch', { name: 'Supplement checklist' })).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Creatine')).not.toBeInTheDocument()
  })
})

describe('SupplementsCard', () => {
  it('toggles a single per-day supplementLogs row when a chip is tapped', async () => {
    const user = userEvent.setup()
    const todayKey = toDateKey(new Date())

    render(
      <MemoryRouter>
        <SupplementsCard todayKey={todayKey} />
      </MemoryRouter>,
    )

    // Creatine chip shows its reminder note as small text.
    await user.click(await screen.findByText('Creatine'))
    expect(screen.getByText('3–5 g daily (editable reminder)')).toBeInTheDocument()

    await waitFor(async () => {
      const log = await db.supplementLogs.where('dateKey').equals(todayKey).first()
      expect(log?.takenItemIds).toContain('sup-creatine')
    })

    // Tapping again unticks the same row — never a duplicate for the day.
    await user.click(screen.getByText('Creatine'))
    await waitFor(async () => {
      const log = await db.supplementLogs.where('dateKey').equals(todayKey).first()
      expect(log?.takenItemIds).not.toContain('sup-creatine')
    })
    expect(await db.supplementLogs.where('dateKey').equals(todayKey).count()).toBe(1)
  })
})
