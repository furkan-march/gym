import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { newId, nowIso } from '../../../lib/ids'
import type { PlanKind, ScheduledDay } from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Segmented } from '../../components/Segmented'
import { Button, Card, EmptyState, Row, SectionTitle } from '../../components/core'
import { useSettings } from '../../hooks/useSettings'
import { TemplateEditor } from './TemplateEditor'
import { restoreDefaultProgram } from './restoreDefaults'
import {
  Loading,
  PLAN_KIND_LABELS,
  PlanFootnote,
  WEEKDAY_FULL,
  WEEKDAY_ORDER,
  WEEKDAY_SHORT,
} from './shared'

const PLAN_KIND_OPTIONS: { value: PlanKind; label: string }[] = [
  { value: 'strength', label: 'Strength' },
  { value: 'zone2', label: 'Zone 2' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'rest', label: 'Rest' },
]

/** Training sub-section (SPEC 27): weekly schedule + template management. */
export function TrainingSection() {
  const settings = useSettings()
  const days = useLiveQuery(() => db.scheduledDays.toArray(), [])
  const templates = useLiveQuery(
    async () =>
      (await db.workoutTemplates.orderBy('orderIndex').toArray()).filter((t) => !t.isDemo),
    [],
  )
  const allTex = useLiveQuery(() => db.templateExercises.toArray(), [])

  const [openDayId, setOpenDayId] = useState<string | null>(null)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)

  if (days === undefined || templates === undefined || allTex === undefined) return <Loading />

  if (editingTemplateId)
    return (
      <TemplateEditor
        templateId={editingTemplateId}
        onBack={() => setEditingTemplateId(null)}
      />
    )

  const templateById = new Map(templates.map((t) => [t.id, t]))
  const texCount = new Map<string, number>()
  for (const tex of allTex)
    texCount.set(tex.templateId, (texCount.get(tex.templateId) ?? 0) + 1)

  const dayByWeekday = new Map(days.map((d) => [d.weekday, d]))
  const openDay = openDayId ? (days.find((d) => d.id === openDayId) ?? null) : null

  const describeDay = (d: ScheduledDay): string => {
    if (d.planKind === 'strength') {
      const name = d.templateId ? (templateById.get(d.templateId)?.name ?? 'Missing template') : 'No template'
      return `Strength · ${name}`
    }
    if (d.planKind === 'zone2' && d.cardioMinutesMin != null && d.cardioMinutesMax != null)
      return `Zone 2 · ${d.cardioMinutesMin}–${d.cardioMinutesMax} min`
    return PLAN_KIND_LABELS[d.planKind]
  }

  const setDayKind = async (day: ScheduledDay, kind: PlanKind) => {
    const firstTemplate = templates[0]
    await db.scheduledDays.update(day.id, {
      planKind: kind,
      templateId: kind === 'strength' ? (day.templateId ?? firstTemplate?.id ?? null) : null,
      cardioMinutesMin: kind === 'zone2' ? (settings?.zone2MinutesMin ?? 30) : null,
      cardioMinutesMax: kind === 'zone2' ? (settings?.zone2MinutesMax ?? 40) : null,
      updatedAt: nowIso(),
    })
  }

  const setDayTemplate = async (day: ScheduledDay, templateId: string) => {
    await db.scheduledDays.update(day.id, { templateId, updatedAt: nowIso() })
  }

  const createTemplate = async () => {
    const t = nowIso()
    const id = newId()
    const orderIndex = templates.length
      ? Math.max(...templates.map((x) => x.orderIndex)) + 1
      : 0
    await db.workoutTemplates.add({
      id,
      name: 'New template',
      kind: 'custom',
      isDefault: false,
      orderIndex,
      createdAt: t,
      updatedAt: t,
    })
    setEditingTemplateId(id)
  }

  const restore = async () => {
    await restoreDefaultProgram()
    setConfirmRestore(false)
  }

  return (
    <div>
      <SectionTitle>Weekly schedule</SectionTitle>
      {days.length === 0 ? (
        <EmptyState
          title="No schedule yet"
          body="Restore defaults to set up the standard week."
        />
      ) : (
        <Card>
          {WEEKDAY_ORDER.map((wd) => {
            const d = dayByWeekday.get(wd)
            if (!d) return null
            return (
              <div key={d.id} className="border-b border-border last:border-b-0">
                <Row
                  onClick={() => setOpenDayId(d.id)}
                  left={
                    <div className="flex items-baseline gap-3">
                      <span className="w-10 shrink-0 text-[13px] font-semibold text-text-muted">
                        {WEEKDAY_SHORT[wd]}
                      </span>
                      <span className="truncate text-[15px]">{describeDay(d)}</span>
                    </div>
                  }
                  right={<span className="text-text-muted">›</span>}
                />
              </div>
            )
          })}
        </Card>
      )}

      <SectionTitle>Templates</SectionTitle>
      {templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          body="Create a template or restore the default program."
        />
      ) : (
        <Card>
          {templates.map((t) => (
            <div key={t.id} className="border-b border-border last:border-b-0">
              <Row
                onClick={() => setEditingTemplateId(t.id)}
                left={
                  <div>
                    <div className="truncate text-[15px] font-medium">{t.name}</div>
                    <div className="text-[12px] text-text-muted">
                      {texCount.get(t.id) ?? 0} exercises
                      {t.isDefault ? ' · default' : ' · custom'}
                    </div>
                  </div>
                }
                right={<span className="text-text-muted">›</span>}
              />
            </div>
          ))}
        </Card>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <Button className="w-full" onClick={() => void createTemplate()}>
          New template
        </Button>
        <Button className="w-full" onClick={() => setConfirmRestore(true)}>
          Restore defaults
        </Button>
      </div>

      <PlanFootnote />

      {/* Day editor sheet */}
      <BottomSheet
        open={openDay !== null}
        onClose={() => setOpenDayId(null)}
        title={openDay ? WEEKDAY_FULL[openDay.weekday] : undefined}
      >
        {openDay ? (
          <div className="flex flex-col gap-3">
            <Segmented
              label="Day type"
              options={PLAN_KIND_OPTIONS}
              value={openDay.planKind}
              onChange={(k) => void setDayKind(openDay, k)}
            />
            {openDay.planKind === 'strength' ? (
              <div>
                <div className="mb-1 text-[11px] text-text-muted">Template</div>
                {templates.length === 0 ? (
                  <EmptyState title="No templates" body="Create a template first." />
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {templates.map((t) => {
                      const selected = openDay.templateId === t.id
                      return (
                        <button
                          key={t.id}
                          onClick={() => void setDayTemplate(openDay, t.id)}
                          className={`flex min-h-11 w-full items-center justify-between rounded-xl border px-3 text-left text-[15px] ${
                            selected
                              ? 'border-accent bg-accent/10 text-accent'
                              : 'border-border bg-surface-2'
                          }`}
                        >
                          <span>{t.name}</span>
                          {selected ? <span aria-hidden="true">✓</span> : null}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : null}
            {openDay.planKind === 'zone2' ? (
              <p className="text-[12px] text-text-muted">
                Session length uses the Zone 2 duration from Cardio &amp; steps.
              </p>
            ) : null}
            <Button variant="primary" className="w-full" onClick={() => setOpenDayId(null)}>
              Done
            </Button>
          </div>
        ) : null}
      </BottomSheet>

      <ConfirmDialog
        open={confirmRestore}
        title="Restore default program?"
        body="Resets the weekly schedule (Upper A Tuesday, Upper B Thursday, Lower / Legs Sunday) and restores the three default templates to their original exercises, sets, reps, and rest times. Custom templates, the exercise library, and workout history are not affected."
        confirmLabel="Restore"
        danger
        onConfirm={() => void restore()}
        onCancel={() => setConfirmRestore(false)}
      />
    </div>
  )
}
