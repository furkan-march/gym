import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../../../lib/db'
import { seedDefaults } from '../../../lib/seed/seed'
import { restoreDefaultProgram } from './restoreDefaults'
import PlanScreen from '../Plan'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await seedDefaults()
})

/** Sort by id and drop timestamps so seeded and restored rows compare equal. */
function strip<T extends { id: string }>(rows: T[]): Record<string, unknown>[] {
  return [...rows]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => {
      const c: Record<string, unknown> = { ...r }
      delete c['createdAt']
      delete c['updatedAt']
      return c
    })
}

describe('PlanScreen', () => {
  it('lists the seeded templates in Training and shows derived carbs in Nutrition', async () => {
    render(
      <MemoryRouter>
        <PlanScreen />
      </MemoryRouter>,
    )

    // Training (default section): template list shows the seeded templates.
    expect((await screen.findAllByText('Push A')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('Pull A')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('Legs B')).length).toBeGreaterThan(0)

    // Nutrition: carbs derived from (2450 − 185×4 − 75×9) ÷ 4 = 259 g (SPEC 23).
    await userEvent.click(screen.getByRole('button', { name: 'Nutrition' }))
    expect(await screen.findByText(/= 259 g/)).toBeInTheDocument()
    // V2: meals render as tappable cards (title as text) instead of inline inputs.
    expect(await screen.findByRole('button', { name: /Breakfast/ })).toBeInTheDocument()
  })

  it('restoreDefaultProgram reproduces the seeded program and keeps custom templates', async () => {
    const seededTemplates = strip(await db.workoutTemplates.toArray())
    const seededTex = strip(await db.templateExercises.toArray())
    const seededDays = strip(await db.scheduledDays.toArray())

    // Mutate the program: edit, delete, add, and reassign a day.
    await db.templateExercises.update('tex-ua-1', { prescribedSets: 9 })
    await db.templateExercises.delete('tex-lo-7')
    const t = '2026-08-02T10:00:00.000Z'
    await db.templateExercises.add({
      id: 'tex-user-added',
      templateId: 'tpl-upper-a',
      exerciseId: 'ex-squat',
      defaultVariantId: null,
      orderIndex: 99,
      prescribedSets: 3,
      repRangeMin: 8,
      repRangeMax: 12,
      targetRIRMin: 1,
      targetRIRMax: 2,
      restSeconds: 90,
      incrementKg: null,
      isOptional: false,
      supersetGroup: null,
      alternativeExerciseIds: [],
      rampScheme: [],
      createdAt: t,
      updatedAt: t,
    })
    await db.scheduledDays.update('2', { planKind: 'rest', templateId: null })
    // A custom template that restore must leave alone.
    await db.workoutTemplates.add({
      id: 'tpl-custom-1',
      name: 'My custom day',
      kind: 'custom',
      isDefault: false,
      orderIndex: 3,
      createdAt: t,
      updatedAt: t,
    })

    await restoreDefaultProgram()

    // Anti-drift guard: the local defaultProgram copy must match seed.ts exactly.
    expect(strip(await db.templateExercises.toArray())).toEqual(seededTex)
    expect(strip(await db.scheduledDays.toArray())).toEqual(seededDays)
    const templatesAfter = await db.workoutTemplates.toArray()
    expect(strip(templatesAfter.filter((x) => x.isDefault))).toEqual(seededTemplates)
    expect(templatesAfter.find((x) => x.id === 'tpl-custom-1')?.name).toBe('My custom day')
  })
})
