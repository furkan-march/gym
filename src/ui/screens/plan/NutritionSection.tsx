import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { newId, nowIso } from '../../../lib/ids'
import type { MealTemplate, NutritionTargets } from '../../../lib/types'
import { NumberField } from '../../components/NumberField'
import { Button, Card, EmptyState, SectionTitle } from '../../components/core'
import { updateProfile, updateSettings } from '../../hooks/useSettings'
import { MealEditor, formatMacroLine } from './MealEditor'
import { Loading } from './shared'
import { useState } from 'react'

/** SPEC 23: carbs are always derived from remaining calories, never stored ad hoc. */
function deriveCarbs(n: Pick<NutritionTargets, 'calories' | 'proteinG' | 'fatG'>): number {
  return Math.round((n.calories - n.proteinG * 4 - n.fatG * 9) / 4)
}

interface MacroTotals {
  kcal: number
  proteinG: number
  fatG: number
  carbsG: number
}

/**
 * Sum the optional per-meal macro estimates (V2). Returns null unless at least
 * one meal carries at least one estimated value, so the helper line only shows
 * when there is something to sum. Display only — never enforced (SPEC 39).
 */
function sumMealMacros(meals: MealTemplate[]): MacroTotals | null {
  const totals: MacroTotals = { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 }
  let hasAny = false
  for (const meal of meals) {
    const m = meal.macros
    if (!m) continue
    if (m.kcal != null || m.proteinG != null || m.fatG != null || m.carbsG != null) hasAny = true
    totals.kcal += m.kcal ?? 0
    totals.proteinG += m.proteinG ?? 0
    totals.fatG += m.fatG ?? 0
    totals.carbsG += m.carbsG ?? 0
  }
  return hasAny ? totals : null
}

/** Nutrition sub-section (SPEC 23/27): targets, weight goals, meal ideas. */
export function NutritionSection() {
  const data = useLiveQuery(async () => {
    const [settings, profile, meals] = await Promise.all([
      db.appSettings.get('settings'),
      db.userProfile.get('profile'),
      db.mealTemplates.orderBy('orderIndex').toArray(),
    ])
    return {
      settings: settings ?? null,
      profile: profile ?? null,
      meals: meals.filter((m) => !m.isDemo),
    }
  }, [])

  const [editingMealId, setEditingMealId] = useState<string | null>(null)

  if (data === undefined) return <Loading />
  const { settings, profile, meals } = data

  if (!settings || !profile)
    return (
      <EmptyState title="No nutrition targets yet" body="Defaults are created on first launch." />
    )

  const n = settings.nutrition
  const carbs = deriveCarbs(n)

  const setMacro = (patch: Partial<Pick<NutritionTargets, 'calories' | 'proteinG' | 'fatG'>>) => {
    const next = { ...n, ...patch }
    void updateSettings({ nutrition: { ...next, carbsG: deriveCarbs(next) } })
  }

  const addMeal = async () => {
    const t = nowIso()
    const orderIndex = meals.length ? Math.max(...meals.map((m) => m.orderIndex)) + 1 : 0
    const id = newId()
    await db.mealTemplates.add({
      id,
      title: 'New meal',
      text: '',
      orderIndex,
      createdAt: t,
      updatedAt: t,
    })
    setEditingMealId(id)
  }

  const editingMeal = editingMealId ? (meals.find((m) => m.id === editingMealId) ?? null) : null
  const mealTotals = sumMealMacros(meals)

  return (
    <div>
      <SectionTitle>Daily targets</SectionTitle>
      <Card className="flex flex-col gap-3">
        <NumberField
          label="Calories"
          value={n.calories}
          step={50}
          min={0}
          suffix="kcal"
          onChange={(v) => {
            if (v != null) setMacro({ calories: Math.round(v) })
          }}
        />
        <div className="flex gap-2">
          <NumberField
            wide
            label="Protein"
            value={n.proteinG}
            step={5}
            min={0}
            suffix="g"
            onChange={(v) => {
              if (v != null) setMacro({ proteinG: Math.round(v) })
            }}
          />
          <NumberField
            wide
            label="Fat"
            value={n.fatG}
            step={5}
            min={0}
            suffix="g"
            onChange={(v) => {
              if (v != null) setMacro({ fatG: Math.round(v) })
            }}
          />
        </div>
        <div>
          <div className="text-[11px] text-text-muted">Carbohydrate (derived)</div>
          <div className="tabular mt-0.5 text-xl font-semibold">{carbs} g</div>
          <div className="tabular mt-0.5 text-[12px] text-text-muted">
            ({n.calories} − {n.proteinG}×4 − {n.fatG}×9) ÷ 4 = {carbs} g
          </div>
          {carbs < 0 ? (
            <p className="mt-1 text-[12px] text-warning">
              Protein and fat alone exceed the calorie target.
            </p>
          ) : null}
        </div>
      </Card>
      {mealTotals ? (
        <p className="tabular mt-2 px-1 text-[12px] text-text-muted">
          Meals sum to ~{mealTotals.kcal} kcal of your {n.calories} target · P{' '}
          {mealTotals.proteinG}/{n.proteinG} · F {mealTotals.fatG}/{n.fatG} · C {mealTotals.carbsG}/
          {carbs}
        </p>
      ) : null}

      <SectionTitle>Weight goals</SectionTitle>
      <Card className="flex flex-col gap-3">
        <div className="flex gap-2">
          <NumberField
            wide
            label="Target weight min"
            value={profile.targetWeightMinKg}
            step={0.5}
            min={0}
            suffix="kg"
            onChange={(v) => {
              if (v == null) return
              void updateProfile({
                targetWeightMinKg: v,
                targetWeightMaxKg: Math.max(v, profile.targetWeightMaxKg),
              })
            }}
          />
          <NumberField
            wide
            label="Target weight max"
            value={profile.targetWeightMaxKg}
            step={0.5}
            min={0}
            suffix="kg"
            onChange={(v) => {
              if (v == null) return
              void updateProfile({
                targetWeightMaxKg: v,
                targetWeightMinKg: Math.min(v, profile.targetWeightMinKg),
              })
            }}
          />
        </div>
        <div className="flex gap-2">
          <NumberField
            wide
            label="Weekly loss min"
            value={profile.weeklyLossPctMin}
            step={0.1}
            min={0}
            suffix="%"
            onChange={(v) => {
              if (v == null) return
              void updateProfile({
                weeklyLossPctMin: v,
                weeklyLossPctMax: Math.max(v, profile.weeklyLossPctMax),
              })
            }}
          />
          <NumberField
            wide
            label="Weekly loss max"
            value={profile.weeklyLossPctMax}
            step={0.1}
            min={0}
            suffix="%"
            onChange={(v) => {
              if (v == null) return
              void updateProfile({
                weeklyLossPctMax: v,
                weeklyLossPctMin: Math.min(v, profile.weeklyLossPctMin),
              })
            }}
          />
        </div>
        <NumberField
          label="Target body fat"
          value={profile.targetBodyFatPct}
          step={0.5}
          min={0}
          suffix="%"
          onChange={(v) => {
            if (v != null) void updateProfile({ targetBodyFatPct: v })
          }}
        />
        <p className="text-[12px] text-text-muted">
          Weekly loss is a percentage of current body weight. These are editable estimates, not
          medical guidance.
        </p>
      </Card>

      <SectionTitle>Meal ideas</SectionTitle>
      {meals.length === 0 ? (
        <EmptyState title="No meal ideas yet" body="Add reusable meals with the button below." />
      ) : (
        meals.map((meal) => {
          const items = (meal.items ?? []).filter((line) => line.trim() !== '')
          const macroLine = formatMacroLine(meal.macros)
          return (
            <button
              key={meal.id}
              onClick={() => setEditingMealId(meal.id)}
              className="mb-2 block min-h-11 w-full rounded-2xl border border-border bg-surface p-4 text-left"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                  {meal.title}
                </div>
                <span aria-hidden className="text-[13px] text-text-muted">
                  ›
                </span>
              </div>
              {meal.text.trim() !== '' ? (
                <p className="mt-1 text-[13px] text-text-muted">{meal.text}</p>
              ) : null}
              {meal.lactoseAlternative && meal.lactoseAlternative.trim() !== '' ? (
                <p className="mt-1 text-[12px] text-text-muted">
                  Lactose-sensitive: {meal.lactoseAlternative}
                </p>
              ) : null}
              {items.length > 0 ? (
                <ul className="mt-1.5">
                  {items.map((line, i) => (
                    <li key={i} className="text-[13px]">
                      • {line}
                    </li>
                  ))}
                </ul>
              ) : null}
              {macroLine ? (
                <div className="tabular mt-2 text-[12px] font-medium text-accent">{macroLine}</div>
              ) : null}
            </button>
          )
        })
      )}
      <Button className="mt-1 w-full" onClick={() => void addMeal()}>
        Add meal
      </Button>

      <MealEditor meal={editingMeal} onClose={() => setEditingMealId(null)} />
    </div>
  )
}
