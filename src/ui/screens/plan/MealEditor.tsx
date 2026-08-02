import { useState } from 'react'
import { db } from '../../../lib/db'
import { nowIso } from '../../../lib/ids'
import type { MealTemplate } from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { NumberField } from '../../components/NumberField'
import { Button } from '../../components/core'
import { inputCls } from './shared'

type MealMacros = NonNullable<MealTemplate['macros']>

const EMPTY_MACROS: MealMacros = { kcal: null, proteinG: null, fatG: null, carbsG: null }

/**
 * Format the optional per-meal macro estimate as a compact display line,
 * e.g. "~520 kcal · P 42 · F 18 · C 45". Null fields are omitted; returns
 * null when nothing is estimated so callers can skip the line entirely.
 */
export function formatMacroLine(macros: MealTemplate['macros']): string | null {
  if (!macros) return null
  const parts: string[] = []
  if (macros.kcal != null) parts.push(`~${macros.kcal} kcal`)
  if (macros.proteinG != null) parts.push(`P ${macros.proteinG}`)
  if (macros.fatG != null) parts.push(`F ${macros.fatG}`)
  if (macros.carbsG != null) parts.push(`C ${macros.carbsG}`)
  return parts.length ? parts.join(' · ') : null
}

/**
 * V2 meal-template editor (SPEC 39 item 2): bottom sheet editing one
 * MealTemplate — title, free text, lactose alternative, ordered ingredient
 * lines (`items`) and optional rough macro estimates (`macros`).
 * V1 rows lack `items`/`macros`; both stay optional so no migration is needed.
 */
export function MealEditor({
  meal,
  onClose,
}: {
  meal: MealTemplate | null
  onClose: () => void
}) {
  return (
    <BottomSheet open={meal !== null} onClose={onClose} title="Edit meal">
      {meal ? <EditorBody key={meal.id} meal={meal} onClose={onClose} /> : null}
    </BottomSheet>
  )
}

function GroupLabel({ children }: { children: string }) {
  return (
    <div className="mt-4 mb-1 text-[11px] font-semibold tracking-wide text-text-muted uppercase">
      {children}
    </div>
  )
}

function EditorBody({ meal, onClose }: { meal: MealTemplate; onClose: () => void }) {
  // Local copy of the ingredient lines is the source of truth while the sheet
  // is open (write-through to Dexie) so uncontrolled-vs-liveQuery races can't
  // clobber typing during add/remove/reorder.
  const [items, setItems] = useState<string[]>(meal.items ?? [])
  const [confirmDelete, setConfirmDelete] = useState(false)

  const patch = (p: Partial<MealTemplate>) => {
    void db.mealTemplates.update(meal.id, { ...p, updatedAt: nowIso() })
  }

  const writeItems = (next: string[]) => {
    setItems(next)
    patch({ items: next })
  }

  const moveItem = (i: number, dir: -1 | 1) => {
    const j = i + dir
    const next = [...items]
    const a = next[i]
    const b = next[j]
    if (a === undefined || b === undefined) return
    next[i] = b
    next[j] = a
    writeItems(next)
  }

  const macros = meal.macros
  const setMacroField = (field: keyof MealMacros, v: number | null) => {
    patch({ macros: { ...(macros ?? EMPTY_MACROS), [field]: v == null ? null : Math.round(v) } })
  }

  return (
    <div>
      <input
        aria-label="Meal title"
        defaultValue={meal.title}
        onChange={(e) => patch({ title: e.target.value })}
        className={`${inputCls} font-semibold`}
      />
      <textarea
        aria-label="Meal notes"
        defaultValue={meal.text}
        rows={2}
        placeholder="Foods and rough portions"
        onChange={(e) => patch({ text: e.target.value })}
        className={`${inputCls} mt-2 resize-none py-2 text-[13px]`}
      />
      <input
        aria-label="Lactose-sensitive alternative"
        defaultValue={meal.lactoseAlternative ?? ''}
        placeholder="Lactose-sensitive alternative (optional)"
        onChange={(e) => patch({ lactoseAlternative: e.target.value })}
        className={`${inputCls} mt-2 text-[13px]`}
      />

      <GroupLabel>Ingredients</GroupLabel>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              aria-label={`Ingredient ${i + 1}`}
              value={item}
              placeholder="e.g. 100 g oats"
              onChange={(e) => writeItems(items.map((x, j) => (j === i ? e.target.value : x)))}
              className={`${inputCls} min-w-0 flex-1 text-[13px]`}
            />
            <button
              aria-label={`Move ingredient ${i + 1} up`}
              disabled={i === 0}
              onClick={() => moveItem(i, -1)}
              className="min-h-11 min-w-11 shrink-0 text-text-muted disabled:opacity-30"
            >
              ↑
            </button>
            <button
              aria-label={`Move ingredient ${i + 1} down`}
              disabled={i === items.length - 1}
              onClick={() => moveItem(i, 1)}
              className="min-h-11 min-w-11 shrink-0 text-text-muted disabled:opacity-30"
            >
              ↓
            </button>
            <button
              aria-label={`Remove ingredient ${i + 1}`}
              onClick={() => writeItems(items.filter((_, j) => j !== i))}
              className="min-h-11 min-w-11 shrink-0 text-danger"
            >
              ✕
            </button>
          </div>
        ))}
        <Button onClick={() => writeItems([...items, ''])}>Add ingredient line</Button>
      </div>

      <GroupLabel>Macro estimates (optional)</GroupLabel>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <NumberField
            wide
            label="Est. kcal"
            value={macros?.kcal ?? null}
            step={50}
            min={0}
            onChange={(v) => setMacroField('kcal', v)}
          />
          <NumberField
            wide
            label="Est. protein"
            suffix="g"
            value={macros?.proteinG ?? null}
            step={5}
            min={0}
            onChange={(v) => setMacroField('proteinG', v)}
          />
        </div>
        <div className="flex gap-2">
          <NumberField
            wide
            label="Est. fat"
            suffix="g"
            value={macros?.fatG ?? null}
            step={5}
            min={0}
            onChange={(v) => setMacroField('fatG', v)}
          />
          <NumberField
            wide
            label="Est. carbs"
            suffix="g"
            value={macros?.carbsG ?? null}
            step={5}
            min={0}
            onChange={(v) => setMacroField('carbsG', v)}
          />
        </div>
        <p className="text-[12px] text-text-muted">Rough estimates for planning — not tracking.</p>
        {macros ? (
          <Button onClick={() => patch({ macros: undefined })}>Clear estimates</Button>
        ) : null}
      </div>

      <Button variant="danger" className="mt-4 w-full" onClick={() => setConfirmDelete(true)}>
        Delete meal
      </Button>
      <Button variant="primary" className="mt-2 w-full" onClick={onClose}>
        Done
      </Button>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete meal?"
        body={`Removes “${meal.title}” from your meal ideas.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          setConfirmDelete(false)
          void db.mealTemplates.delete(meal.id)
          onClose()
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
