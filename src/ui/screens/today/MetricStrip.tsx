import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { upsertBodyMetric, upsertSteps } from '../../../lib/data/daily'
import { formatShort } from '../../../lib/dates'
import type { BodyMetric, DateKey } from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { Button, StatTile } from '../../components/core'
import { NumberField } from '../../components/NumberField'
import { useSettings } from '../../hooks/useSettings'
import { PostureChecklist } from './PostureChecklist'
import { usePostureToday } from './usePostureToday'

/**
 * Compact metric strip (SPEC 7 priority 6): steps vs target, posture status
 * (scheduled days only), latest body weight. Each tile opens a quick-log sheet.
 */

type SheetKind = 'steps' | 'posture' | 'weight' | null

const fmtInt = (n: number) => n.toLocaleString('en-US')

interface WeightInfo {
  todayMetric: BodyMetric | null
  latestWeightKg: number | null
  latestWeightDateKey: DateKey | null
}

export function MetricStrip({
  todayKey,
  stepsOptional,
}: {
  todayKey: DateKey
  stepsOptional: boolean
}) {
  const settings = useSettings()
  const posture = usePostureToday(todayKey)
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [stepsDraft, setStepsDraft] = useState<number | null>(null)
  const [weightDraft, setWeightDraft] = useState<number | null>(null)
  const [waistDraft, setWaistDraft] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activity = useLiveQuery(async () => {
    const rows = await db.dailyActivities.where('dateKey').equals(todayKey).toArray()
    return rows.find((r) => !r.isDemo) ?? null
  }, [todayKey])

  const weight = useLiveQuery<WeightInfo>(async () => {
    const rows = (await db.bodyMetrics.orderBy('dateKey').reverse().toArray()).filter(
      (m) => !m.isDemo,
    )
    const todayMetric = rows.find((m) => m.dateKey === todayKey) ?? null
    const latest = rows.find((m) => m.weightKg != null) ?? null
    return {
      todayMetric,
      latestWeightKg: latest?.weightKg ?? null,
      latestWeightDateKey: latest?.dateKey ?? null,
    }
  }, [todayKey])

  if (!settings || activity === undefined || weight === undefined || posture.loading) {
    return <div className="h-20 rounded-2xl border border-border bg-surface" aria-hidden />
  }

  const precision = settings.decimalPrecision
  const stepTarget = `${fmtInt(settings.stepTargetMin)}–${fmtInt(settings.stepTargetMax)}`

  const openSteps = () => {
    setStepsDraft(activity?.steps ?? null)
    setError(null)
    setSheet('steps')
  }
  const openWeight = () => {
    setWeightDraft(weight.todayMetric?.weightKg ?? weight.latestWeightKg)
    setWaistDraft(weight.todayMetric?.waistCm ?? null)
    setError(null)
    setSheet('weight')
  }

  const saveSteps = async () => {
    try {
      await upsertSteps(todayKey, stepsDraft)
      setSheet(null)
    } catch {
      setError('Could not save — the on-device storage write failed. Try again.')
    }
  }

  const saveWeight = async () => {
    const patch: Partial<Pick<BodyMetric, 'weightKg' | 'waistCm'>> = {}
    if (weightDraft != null) patch.weightKg = weightDraft
    if (waistDraft != null) patch.waistCm = waistDraft
    try {
      if (Object.keys(patch).length > 0) await upsertBodyMetric(todayKey, patch)
      setSheet(null)
    } catch {
      setError('Could not save — the on-device storage write failed. Try again.')
    }
  }

  const postureValue =
    posture.items.length === 0
      ? '—'
      : posture.allDone
        ? 'Done'
        : `${posture.completedIds.length}/${posture.items.length}`

  return (
    <>
      <div className={`grid gap-2 ${posture.scheduled ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <button className="text-left" onClick={openSteps}>
          <StatTile
            label="Steps"
            value={activity?.steps != null ? fmtInt(activity.steps) : '—'}
            hint={stepsOptional ? `optional ~${fmtInt(settings.stepTargetMin)}` : `target ${stepTarget}`}
          />
        </button>
        {posture.scheduled ? (
          <button
            className="text-left"
            onClick={() => {
              setError(null)
              setSheet('posture')
            }}
          >
            <StatTile
              label="Posture"
              value={postureValue}
              hint={posture.required ? 'scheduled' : 'optional'}
            />
          </button>
        ) : null}
        <button className="text-left" onClick={openWeight}>
          <StatTile
            label="Weight"
            value={
              weight.latestWeightKg != null ? `${weight.latestWeightKg.toFixed(precision)} kg` : '—'
            }
            hint={
              weight.latestWeightDateKey != null
                ? formatShort(weight.latestWeightDateKey)
                : 'no entries yet'
            }
          />
        </button>
      </div>

      <BottomSheet open={sheet === 'steps'} onClose={() => setSheet(null)} title="Steps today">
        <NumberField label="Steps" value={stepsDraft} onChange={setStepsDraft} step={500} />
        <div className="mt-2 text-[12px] text-text-muted">
          {stepsOptional ? 'Optional target today' : 'Target'}: {stepTarget} steps
        </div>
        {error ? <div className="mt-2 text-[13px] text-danger">{error}</div> : null}
        <Button variant="primary" className="mt-4 w-full" onClick={() => void saveSteps()}>
          Save
        </Button>
      </BottomSheet>

      <BottomSheet open={sheet === 'posture'} onClose={() => setSheet(null)} title="Posture routine">
        <div className="mb-2 text-[13px] text-text-muted">
          {posture.allDone
            ? 'All items done today.'
            : `${posture.completedIds.length} of ${posture.items.length} items done — completed when all are checked.`}
        </div>
        <PostureChecklist
          items={posture.items}
          completedIds={posture.completedIds}
          onToggle={(id) =>
            void posture
              .toggle(id)
              .catch(() => setError('Could not save — the on-device storage write failed.'))
          }
        />
        {error ? <div className="mt-2 text-[13px] text-danger">{error}</div> : null}
      </BottomSheet>

      <BottomSheet open={sheet === 'weight'} onClose={() => setSheet(null)} title="Body weight">
        <div className="flex gap-3">
          <NumberField
            label="Weight"
            suffix="kg"
            step={0.1}
            value={weightDraft}
            onChange={setWeightDraft}
            wide
          />
          <NumberField
            label="Waist"
            suffix="cm"
            step={0.5}
            value={waistDraft}
            onChange={setWaistDraft}
            wide
          />
        </div>
        <div className="mt-2 text-[12px] text-text-muted">
          Logged for today ({formatShort(todayKey)}). Leave a field empty to skip it.
        </div>
        {error ? <div className="mt-2 text-[13px] text-danger">{error}</div> : null}
        <Button variant="primary" className="mt-4 w-full" onClick={() => void saveWeight()}>
          Save
        </Button>
      </BottomSheet>
    </>
  )
}
