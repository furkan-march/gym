import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { newId, nowIso } from '../../../lib/ids'
import type { TemplateExercise } from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { NumberField } from '../../components/NumberField'
import { Button, Card, Chip, EmptyState, Row, SectionTitle } from '../../components/core'
import { ExercisePicker } from './ExercisePicker'
import { Loading, PlanFootnote, inputCls } from './shared'

function patchTex(id: string, patch: Partial<TemplateExercise>): void {
  void db.templateExercises.update(id, { ...patch, updatedAt: nowIso() })
}

function formatRange(min: number, max: number): string {
  return min === max ? String(min) : `${min}–${max}`
}

/** Template editor (SPEC 27): rename, reorder, add/remove/edit exercises. */
export function TemplateEditor({
  templateId,
  onBack,
}: {
  templateId: string
  onBack: () => void
}) {
  const template = useLiveQuery(
    async () => (await db.workoutTemplates.get(templateId)) ?? null,
    [templateId],
  )
  const texRows = useLiveQuery(async () => {
    const rows = await db.templateExercises.where('templateId').equals(templateId).toArray()
    return rows.sort((a, b) => a.orderIndex - b.orderIndex)
  }, [templateId])
  const exercises = useLiveQuery(
    async () => (await db.exercises.toArray()).filter((e) => !e.isDemo),
    [],
  )

  const [editingTexId, setEditingTexId] = useState<string | null>(null)
  const [addPickerOpen, setAddPickerOpen] = useState(false)
  const [altPickerOpen, setAltPickerOpen] = useState(false)
  const [confirmRemoveTex, setConfirmRemoveTex] = useState(false)
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState(false)

  if (template === undefined || texRows === undefined || exercises === undefined)
    return <Loading />

  if (template === null)
    return (
      <div>
        <Button variant="ghost" className="mt-3" onClick={onBack}>
          ‹ Back to plan
        </Button>
        <EmptyState title="Template not found" body="It may have been deleted." />
      </div>
    )

  const exerciseById = new Map(exercises.map((e) => [e.id, e]))
  const editingTex = editingTexId ? (texRows.find((r) => r.id === editingTexId) ?? null) : null
  const editingExercise = editingTex ? exerciseById.get(editingTex.exerciseId) : undefined
  const supersetGroups = [
    ...new Set(texRows.map((r) => r.supersetGroup).filter((g): g is string => g !== null)),
  ]

  const move = (index: number, dir: -1 | 1) => {
    const a = texRows[index]
    const b = texRows[index + dir]
    if (!a || !b) return
    void db.transaction('rw', db.templateExercises, async () => {
      await db.templateExercises.update(a.id, { orderIndex: b.orderIndex, updatedAt: nowIso() })
      await db.templateExercises.update(b.id, { orderIndex: a.orderIndex, updatedAt: nowIso() })
    })
  }

  const addExercise = async (exerciseId: string) => {
    const t = nowIso()
    const orderIndex = texRows.length
      ? Math.max(...texRows.map((r) => r.orderIndex)) + 1
      : 0
    await db.templateExercises.add({
      id: newId(),
      templateId,
      exerciseId,
      defaultVariantId: null,
      orderIndex,
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
    setAddPickerOpen(false)
  }

  const removeTex = () => {
    if (!editingTex) return
    void db.templateExercises.delete(editingTex.id)
    setConfirmRemoveTex(false)
    setEditingTexId(null)
  }

  const toggleAlternative = (exerciseId: string) => {
    if (!editingTex) return
    const has = editingTex.alternativeExerciseIds.includes(exerciseId)
    patchTex(editingTex.id, {
      alternativeExerciseIds: has
        ? editingTex.alternativeExerciseIds.filter((id) => id !== exerciseId)
        : [...editingTex.alternativeExerciseIds, exerciseId],
    })
  }

  const deleteTemplate = async () => {
    await db.transaction(
      'rw',
      [db.workoutTemplates, db.templateExercises, db.scheduledDays],
      async () => {
        await db.templateExercises.where('templateId').equals(templateId).delete()
        const linkedDays = (await db.scheduledDays.toArray()).filter(
          (d) => d.templateId === templateId,
        )
        for (const d of linkedDays)
          await db.scheduledDays.update(d.id, {
            planKind: 'rest',
            templateId: null,
            updatedAt: nowIso(),
          })
        await db.workoutTemplates.delete(templateId)
      },
    )
    setConfirmDeleteTemplate(false)
    onBack()
  }

  return (
    <div>
      <Button variant="ghost" className="mt-3 px-1" onClick={onBack}>
        ‹ Back to plan
      </Button>

      <input
        key={template.id}
        aria-label="Template name"
        defaultValue={template.name}
        onChange={(e) =>
          db.workoutTemplates.update(templateId, { name: e.target.value, updatedAt: nowIso() })
        }
        className={`${inputCls} mt-2 text-[17px] font-semibold`}
      />

      <SectionTitle>Exercises</SectionTitle>
      <Card>
        {texRows.length === 0 ? (
          <EmptyState
            title="No exercises yet"
            body="Add exercises from the library to build this template."
          />
        ) : (
          texRows.map((tex, i) => {
            const ex = exerciseById.get(tex.exerciseId)
            const name = ex?.name ?? 'Unknown exercise'
            return (
              <div
                key={tex.id}
                className="flex items-center gap-1 border-b border-border last:border-b-0"
              >
                <button
                  onClick={() => setEditingTexId(tex.id)}
                  className="min-h-11 min-w-0 flex-1 py-2 text-left"
                >
                  <div className="truncate text-[15px] font-medium">
                    {name}
                    {tex.isOptional ? (
                      <span className="font-normal text-text-muted"> · optional</span>
                    ) : null}
                  </div>
                  <div className="tabular mt-0.5 text-[12px] text-text-muted">
                    {tex.prescribedSets} × {formatRange(tex.repRangeMin, tex.repRangeMax)} · RIR{' '}
                    {formatRange(tex.targetRIRMin, tex.targetRIRMax)} · rest {tex.restSeconds}s
                    {tex.supersetGroup ? ` · superset ${tex.supersetGroup}` : ''}
                  </div>
                </button>
                <button
                  aria-label={`Move ${name} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="min-h-11 min-w-11 text-text-muted disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  aria-label={`Move ${name} down`}
                  disabled={i === texRows.length - 1}
                  onClick={() => move(i, 1)}
                  className="min-h-11 min-w-11 text-text-muted disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
            )
          })
        )}
      </Card>

      <Button className="mt-3 w-full" onClick={() => setAddPickerOpen(true)}>
        Add exercise
      </Button>

      {!template.isDefault ? (
        <Button
          variant="danger"
          className="mt-2 w-full"
          onClick={() => setConfirmDeleteTemplate(true)}
        >
          Delete template
        </Button>
      ) : null}

      <PlanFootnote />

      {/* Add-exercise picker (single select) */}
      <ExercisePicker
        open={addPickerOpen}
        title="Add exercise"
        exercises={exercises}
        onToggle={(id) => void addExercise(id)}
        onClose={() => setAddPickerOpen(false)}
      />

      {/* Per-exercise editor */}
      <BottomSheet
        open={editingTex !== null}
        onClose={() => setEditingTexId(null)}
        title={editingExercise?.name ?? 'Edit exercise'}
      >
        {editingTex ? (
          <div className="flex flex-col gap-3">
            <NumberField
              label="Working sets"
              value={editingTex.prescribedSets}
              step={1}
              min={1}
              onChange={(v) => {
                if (v != null) patchTex(editingTex.id, { prescribedSets: Math.round(v) })
              }}
            />
            <div className="flex gap-2">
              <NumberField
                wide
                label="Reps min"
                value={editingTex.repRangeMin}
                step={1}
                min={1}
                onChange={(v) => {
                  if (v == null) return
                  const min = Math.round(v)
                  patchTex(editingTex.id, {
                    repRangeMin: min,
                    repRangeMax: Math.max(min, editingTex.repRangeMax),
                  })
                }}
              />
              <NumberField
                wide
                label="Reps max"
                value={editingTex.repRangeMax}
                step={1}
                min={1}
                onChange={(v) => {
                  if (v == null) return
                  const max = Math.round(v)
                  patchTex(editingTex.id, {
                    repRangeMax: max,
                    repRangeMin: Math.min(max, editingTex.repRangeMin),
                  })
                }}
              />
            </div>
            <div className="flex gap-2">
              <NumberField
                wide
                label="Target RIR min"
                value={editingTex.targetRIRMin}
                step={1}
                min={0}
                onChange={(v) => {
                  if (v == null) return
                  const min = Math.min(5, Math.max(0, Math.round(v)))
                  patchTex(editingTex.id, {
                    targetRIRMin: min,
                    targetRIRMax: Math.max(min, editingTex.targetRIRMax),
                  })
                }}
              />
              <NumberField
                wide
                label="Target RIR max"
                value={editingTex.targetRIRMax}
                step={1}
                min={0}
                onChange={(v) => {
                  if (v == null) return
                  const max = Math.min(5, Math.max(0, Math.round(v)))
                  patchTex(editingTex.id, {
                    targetRIRMax: max,
                    targetRIRMin: Math.min(max, editingTex.targetRIRMin),
                  })
                }}
              />
            </div>
            <NumberField
              label="Rest between sets"
              value={editingTex.restSeconds}
              step={5}
              min={0}
              suffix="s"
              onChange={(v) => {
                if (v != null) patchTex(editingTex.id, { restSeconds: Math.round(v) })
              }}
            />
            <div>
              <NumberField
                label="Load increment"
                value={editingTex.incrementKg}
                step={0.5}
                min={0}
                suffix="kg"
                onChange={(v) => patchTex(editingTex.id, { incrementKg: v })}
              />
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[11px] text-text-muted">
                  Empty = exercise default ({editingExercise?.defaultIncrementKg ?? 0} kg)
                </span>
                {editingTex.incrementKg != null ? (
                  <Button
                    variant="ghost"
                    className="text-[12px]"
                    onClick={() => patchTex(editingTex.id, { incrementKg: null })}
                  >
                    Use default
                  </Button>
                ) : null}
              </div>
            </div>

            <Row
              left={<span className="text-[14px]">Optional exercise</span>}
              right={
                <Chip
                  active={editingTex.isOptional}
                  onClick={() => patchTex(editingTex.id, { isOptional: !editingTex.isOptional })}
                >
                  {editingTex.isOptional ? 'Optional' : 'Required'}
                </Chip>
              }
            />

            <div>
              <div className="mb-1 text-[11px] text-text-muted">
                Superset group (exercises sharing a group are paired)
              </div>
              <input
                key={editingTex.id}
                aria-label="Superset group"
                list={`superset-groups-${templateId}`}
                defaultValue={editingTex.supersetGroup ?? ''}
                placeholder="None"
                onChange={(e) =>
                  patchTex(editingTex.id, { supersetGroup: e.target.value.trim() || null })
                }
                className={inputCls}
              />
              <datalist id={`superset-groups-${templateId}`}>
                {supersetGroups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>

            <div>
              <div className="mb-1 text-[11px] text-text-muted">Alternatives</div>
              <div className="text-[13px]">
                {editingTex.alternativeExerciseIds.length === 0 ? (
                  <span className="text-text-muted">None</span>
                ) : (
                  editingTex.alternativeExerciseIds
                    .map((id) => exerciseById.get(id)?.name ?? 'Unknown')
                    .join(', ')
                )}
              </div>
              <Button className="mt-2 w-full" onClick={() => setAltPickerOpen(true)}>
                Edit alternatives
              </Button>
            </div>

            <Button variant="danger" className="w-full" onClick={() => setConfirmRemoveTex(true)}>
              Remove exercise
            </Button>
          </div>
        ) : null}
      </BottomSheet>

      {/* Alternatives picker (multi select) — mounted after the editor sheet so it stacks on top */}
      <ExercisePicker
        open={altPickerOpen && editingTex !== null}
        title="Alternatives"
        exercises={exercises}
        selectedIds={editingTex?.alternativeExerciseIds ?? []}
        excludeIds={editingTex ? [editingTex.exerciseId] : []}
        onToggle={toggleAlternative}
        onClose={() => setAltPickerOpen(false)}
      />

      <ConfirmDialog
        open={confirmRemoveTex}
        title="Remove exercise?"
        body={`Removes ${editingExercise?.name ?? 'this exercise'} from ${template.name}. Logged history is not affected.`}
        confirmLabel="Remove"
        danger
        onConfirm={removeTex}
        onCancel={() => setConfirmRemoveTex(false)}
      />

      <ConfirmDialog
        open={confirmDeleteTemplate}
        title="Delete template?"
        body={`Deletes ${template.name} and its exercise list. Scheduled days using it become rest days. Completed sessions keep their own snapshot and are not affected.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => void deleteTemplate()}
        onCancel={() => setConfirmDeleteTemplate(false)}
      />
    </div>
  )
}
