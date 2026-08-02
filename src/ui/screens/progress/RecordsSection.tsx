import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { formatShort } from '../../../lib/dates'
import type { PersonalRecord, PersonalRecordKind } from '../../../lib/types'
import { Card, EmptyState, SectionTitle } from '../../components/core'
import { filterDemo } from './data'
import { fmtInt, fmtKg } from './format'

/**
 * Personal records (SPEC 21), grouped by exercise. Rows come straight from the
 * personalRecords table (rebuilt by the records engine after every session);
 * incomparable variants and machine contexts stay separate records.
 */

const KIND_LABELS: Record<PersonalRecordKind, string> = {
  heaviestLoad: 'Heaviest load',
  best1RM: 'Best e1RM (estimate)',
  mostRepsAtLoad: 'Most reps at top load',
  bestSessionVolume: 'Best session volume',
  bestSet: 'Best set (e1RM estimate)',
  bodyweightReps: 'Bodyweight reps',
  addedWeightPullup: 'Added-weight pull-up',
  heaviestEffectiveLoad: 'Heaviest effective load',
}

const KIND_ORDER: PersonalRecordKind[] = [
  'heaviestLoad',
  'best1RM',
  'mostRepsAtLoad',
  'bestSessionVolume',
  'bestSet',
  'bodyweightReps',
  'addedWeightPullup',
  'heaviestEffectiveLoad',
]

function formatRecordValue(r: PersonalRecord): string {
  switch (r.kind) {
    case 'heaviestLoad':
      return r.secondaryValue != null
        ? `${fmtKg(r.value)} kg × ${r.secondaryValue}`
        : `${fmtKg(r.value)} kg`
    case 'best1RM':
    case 'bestSet':
    case 'heaviestEffectiveLoad':
      return `${fmtKg(r.value)} kg`
    case 'mostRepsAtLoad':
      return r.secondaryValue != null
        ? `${Math.round(r.value)} reps @ ${fmtKg(r.secondaryValue)} kg`
        : `${Math.round(r.value)} reps`
    case 'bestSessionVolume':
      return `${fmtInt(r.value)} kg`
    case 'bodyweightReps':
      return `${Math.round(r.value)} reps`
    case 'addedWeightPullup':
      return r.secondaryValue != null
        ? `+${fmtKg(r.value)} kg × ${r.secondaryValue}`
        : `+${fmtKg(r.value)} kg`
  }
}

export function RecordsSection({ includeDemo }: { includeDemo: boolean }) {
  const data = useLiveQuery(async () => {
    const [records, exercises, variants, contexts] = await Promise.all([
      db.personalRecords.toArray(),
      db.exercises.toArray(),
      db.exerciseVariants.toArray(),
      db.equipmentContexts.toArray(),
    ])
    return { records: filterDemo(records, includeDemo), exercises, variants, contexts }
  }, [includeDemo])

  if (data === undefined) {
    return (
      <>
        <SectionTitle>Personal records</SectionTitle>
        <p className="py-4 text-center text-[13px] text-text-muted">Loading…</p>
      </>
    )
  }

  if (data.records.length === 0) {
    return (
      <>
        <SectionTitle>Personal records</SectionTitle>
        <EmptyState
          title="No personal records yet"
          body="Records appear automatically after your first completed workout with valid working sets — heaviest load, best estimated 1RM, and more."
        />
      </>
    )
  }

  // Group by exercise; keep variant/context qualifiers on each row.
  const byExercise = new Map<string, PersonalRecord[]>()
  for (const r of data.records) {
    const list = byExercise.get(r.exerciseId)
    if (list) list.push(r)
    else byExercise.set(r.exerciseId, [r])
  }

  const groups = [...byExercise.entries()]
    .map(([exerciseId, records]) => ({
      exerciseId,
      name: data.exercises.find((e) => e.id === exerciseId)?.name ?? 'Unknown exercise',
      records: [...records].sort(
        (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const qualifier = (r: PersonalRecord): string | null => {
    const parts: string[] = []
    if (r.variantId != null) {
      parts.push(data.variants.find((v) => v.id === r.variantId)?.name ?? 'Variant')
    }
    if (r.equipmentContextId != null) {
      const ctx = data.contexts.find((c) => c.id === r.equipmentContextId)
      parts.push(ctx?.machineName ?? ctx?.gym ?? 'Machine context')
    }
    return parts.length > 0 ? parts.join(' · ') : null
  }

  return (
    <>
      <SectionTitle>Personal records</SectionTitle>
      {groups.map((g) => (
        <Card key={g.exerciseId} className="mt-3">
          <h3 className="text-[15px] font-semibold">{g.name}</h3>
          <div className="mt-1 divide-y divide-border">
            {g.records.map((r) => {
              const q = qualifier(r)
              return (
                <div key={r.id} className="flex min-h-11 items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[13px]">{KIND_LABELS[r.kind]}</div>
                    {q ? <div className="text-[11px] text-text-muted">{q}</div> : null}
                  </div>
                  <div className="text-right">
                    <div className="tabular text-[14px] font-semibold">{formatRecordValue(r)}</div>
                    <div className="text-[11px] text-text-muted">{formatShort(r.dateKey)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      ))}
    </>
  )
}
