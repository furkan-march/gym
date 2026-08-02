import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { upsertNutrition } from '../../../lib/data/daily'
import type { CalorieAdherence, DateKey, ProteinAdherence } from '../../../lib/types'
import { Card, Chip } from '../../components/core'
import { Segmented } from '../../components/Segmented'

/** Quick nutrition-adherence log for today (SPEC 7 priority 7, SPEC 23). */

const CALORIE_OPTIONS: { value: CalorieAdherence; label: string }[] = [
  { value: 'under', label: 'Under' },
  { value: 'onTarget', label: 'On target' },
  { value: 'over', label: 'Over' },
  { value: 'notTracked', label: 'Not tracked' },
]

const PROTEIN_OPTIONS: { value: ProteinAdherence; label: string }[] = [
  { value: 'reached', label: 'Reached' },
  { value: 'nearly', label: 'Nearly' },
  { value: 'missed', label: 'Missed' },
  { value: 'notTracked', label: 'Not tracked' },
]

export function NutritionCard({ todayKey }: { todayKey: DateKey }) {
  const [error, setError] = useState<string | null>(null)
  const log = useLiveQuery(async () => {
    const rows = await db.nutritionAdherenceLogs.where('dateKey').equals(todayKey).toArray()
    return rows.find((r) => !r.isDemo) ?? null
  }, [todayKey])

  if (log === undefined) {
    return <div className="h-32 rounded-2xl border border-border bg-surface" aria-hidden />
  }

  const write = (patch: Parameters<typeof upsertNutrition>[1]) => {
    void upsertNutrition(todayKey, patch).catch(() =>
      setError('Could not save — the on-device storage write failed.'),
    )
  }

  return (
    <Card>
      <div className="mb-2 text-[15px] font-medium">Nutrition today</div>
      <div className="flex flex-col gap-2">
        <Segmented
          label="Calories"
          options={CALORIE_OPTIONS}
          value={log?.calories ?? null}
          onChange={(v) => write({ calories: v })}
        />
        <Segmented
          label="Protein"
          options={PROTEIN_OPTIONS}
          value={log?.protein ?? null}
          onChange={(v) => write({ protein: v })}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <Chip
          active={log?.fruitVeg === true}
          onClick={() => write({ fruitVeg: log?.fruitVeg === true ? null : true })}
        >
          Fruit & veg
        </Chip>
        <Chip
          active={log?.water === true}
          onClick={() => write({ water: log?.water === true ? null : true })}
        >
          Water
        </Chip>
      </div>
      {error ? <div className="mt-2 text-[13px] text-danger">{error}</div> : null}
    </Card>
  )
}
