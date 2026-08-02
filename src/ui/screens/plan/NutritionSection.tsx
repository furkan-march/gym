import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { newId, nowIso } from '../../../lib/ids'
import type { NutritionTargets } from '../../../lib/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { NumberField } from '../../components/NumberField'
import { Button, Card, EmptyState, SectionTitle } from '../../components/core'
import { updateProfile, updateSettings } from '../../hooks/useSettings'
import { Loading, inputCls } from './shared'
import { useState } from 'react'

/** SPEC 23: carbs are always derived from remaining calories, never stored ad hoc. */
function deriveCarbs(n: Pick<NutritionTargets, 'calories' | 'proteinG' | 'fatG'>): number {
  return Math.round((n.calories - n.proteinG * 4 - n.fatG * 9) / 4)
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

  const [removingMealId, setRemovingMealId] = useState<string | null>(null)

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
    await db.mealTemplates.add({
      id: newId(),
      title: 'New meal',
      text: '',
      orderIndex,
      createdAt: t,
      updatedAt: t,
    })
  }

  const removingMeal = removingMealId ? (meals.find((m) => m.id === removingMealId) ?? null) : null

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
        <EmptyState title="No meal ideas yet" body="Add simple reusable meal notes below." />
      ) : (
        meals.map((meal) => (
          <Card key={meal.id} className="mb-2 flex flex-col gap-2">
            <div className="flex items-center gap-1">
              <input
                aria-label="Meal title"
                defaultValue={meal.title}
                onChange={(e) =>
                  db.mealTemplates.update(meal.id, { title: e.target.value, updatedAt: nowIso() })
                }
                className={`${inputCls} font-semibold`}
              />
              <button
                aria-label={`Remove ${meal.title}`}
                onClick={() => setRemovingMealId(meal.id)}
                className="min-h-11 min-w-11 shrink-0 text-danger"
              >
                ✕
              </button>
            </div>
            <textarea
              aria-label="Meal contents"
              defaultValue={meal.text}
              rows={2}
              placeholder="Foods and rough portions"
              onChange={(e) =>
                db.mealTemplates.update(meal.id, { text: e.target.value, updatedAt: nowIso() })
              }
              className={`${inputCls} resize-none py-2 text-[13px]`}
            />
            <input
              aria-label="Lactose-sensitive alternative"
              defaultValue={meal.lactoseAlternative ?? ''}
              placeholder="Lactose-sensitive alternative (optional)"
              onChange={(e) =>
                db.mealTemplates.update(meal.id, {
                  lactoseAlternative: e.target.value,
                  updatedAt: nowIso(),
                })
              }
              className={`${inputCls} text-[13px]`}
            />
          </Card>
        ))
      )}
      <Button className="mt-1 w-full" onClick={() => void addMeal()}>
        Add meal idea
      </Button>

      <ConfirmDialog
        open={removingMeal !== null}
        title="Remove meal idea?"
        body={removingMeal ? `Removes “${removingMeal.title}” from the list.` : undefined}
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (removingMeal) void db.mealTemplates.delete(removingMeal.id)
          setRemovingMealId(null)
        }}
        onCancel={() => setRemovingMealId(null)}
      />
    </div>
  )
}
