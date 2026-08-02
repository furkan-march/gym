import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../../lib/db'
import { seedDefaults } from '../../../lib/seed/seed'
import SettingsScreen from '../Settings'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await seedDefaults()
})

describe('SettingsScreen', () => {
  it('renders the seeded settings with the Data section and storage warning', async () => {
    render(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    )
    // DATA section (SPEC 28/30)
    expect(await screen.findByText('Export full backup')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Deleting the home-screen app, clearing Safari website data, or restoring the phone destroys all local data — export a backup first.',
      ),
    ).toBeInTheDocument()
    // Seeded profile appears in the PROFILE section
    expect(screen.getByText(/Furkan/)).toBeInTheDocument()
    // Last backup starts at "Never"
    expect(screen.getByText('Never')).toBeInTheDocument()
  })
})
