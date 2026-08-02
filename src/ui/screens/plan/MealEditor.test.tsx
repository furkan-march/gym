import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../../../lib/db'
import { seedDefaults } from '../../../lib/seed/seed'
import { NutritionSection } from './NutritionSection'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await seedDefaults()
})

function renderNutrition() {
  render(
    <MemoryRouter>
      <NutritionSection />
    </MemoryRouter>,
  )
}

describe('MealEditor (V2)', () => {
  it('shows meal cards, and a macro estimate added in the editor appears on the card', async () => {
    renderNutrition()

    // V1-seeded meals render as tappable cards (title as text, not input).
    const card = await screen.findByRole('button', { name: /Breakfast/ })
    await userEvent.click(card)

    // Editor sheet is open with the planning-only note.
    expect(await screen.findByText('Rough estimates for planning — not tracking.')).toBeVisible()
    expect(screen.getByDisplayValue('Breakfast')).toBeInTheDocument()

    // Add a rough kcal estimate via the stepper (one bump from empty = step 50).
    await userEvent.click(screen.getByRole('button', { name: 'increase Est. kcal' }))

    // Card now shows the macro line ("~50 kcal" — null fields are omitted)...
    expect(await screen.findByText('~50 kcal')).toBeInTheDocument()
    // ...and the daily-total helper line appears under the targets.
    expect(
      await screen.findByText(/Meals sum to ~50 kcal of your 2450 target/),
    ).toBeInTheDocument()

    // Add a protein estimate too; the card line grows.
    await userEvent.click(screen.getByRole('button', { name: 'increase Est. protein' }))
    expect(await screen.findByText('~50 kcal · P 5')).toBeInTheDocument()

    // Clear estimates sets macros back to undefined: line and helper disappear.
    await userEvent.click(screen.getByRole('button', { name: 'Clear estimates' }))
    await waitFor(() => {
      expect(screen.queryByText('~50 kcal · P 5')).toBeNull()
      expect(screen.queryByText(/Meals sum to/)).toBeNull()
    })
    const row = await db.mealTemplates.get('meal-1')
    expect(row?.macros).toBeUndefined()
  })

  it('adds, edits, reorders and removes ingredient lines (MealTemplate.items)', async () => {
    renderNutrition()
    await userEvent.click(await screen.findByRole('button', { name: /Breakfast/ }))

    // Two ingredient lines.
    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient line' }))
    await userEvent.type(screen.getByLabelText('Ingredient 1'), '3 eggs')
    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient line' }))
    await userEvent.type(screen.getByLabelText('Ingredient 2'), '80 g oats')

    await waitFor(async () => {
      expect((await db.mealTemplates.get('meal-1'))?.items).toEqual(['3 eggs', '80 g oats'])
    })
    // Item lines render on the card.
    expect(await screen.findByText('• 3 eggs')).toBeInTheDocument()
    expect(await screen.findByText('• 80 g oats')).toBeInTheDocument()

    // Reorder: move the second line up.
    await userEvent.click(screen.getByRole('button', { name: 'Move ingredient 2 up' }))
    await waitFor(async () => {
      expect((await db.mealTemplates.get('meal-1'))?.items).toEqual(['80 g oats', '3 eggs'])
    })

    // Remove the first line.
    await userEvent.click(screen.getByRole('button', { name: 'Remove ingredient 1' }))
    await waitFor(async () => {
      expect((await db.mealTemplates.get('meal-1'))?.items).toEqual(['3 eggs'])
    })
  })

  it('adds a meal, opens it in the editor, and deletes it with confirmation', async () => {
    renderNutrition()
    await screen.findByRole('button', { name: /Breakfast/ })

    await userEvent.click(screen.getByRole('button', { name: 'Add meal' }))
    // The new meal opens in the editor.
    expect(await screen.findByDisplayValue('New meal')).toBeInTheDocument()

    // Delete goes through the confirm dialog.
    await userEvent.click(screen.getByRole('button', { name: 'Delete meal' }))
    expect(await screen.findByText('Delete meal?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(async () => {
      expect(await db.mealTemplates.count()).toBe(4) // back to the 4 seeded meals
    })
    expect(screen.queryByDisplayValue('New meal')).toBeNull()

    // V1 targets editing is untouched: derived carbs formula still renders.
    expect(await screen.findByText(/= 259 g/)).toBeInTheDocument()
  })
})
