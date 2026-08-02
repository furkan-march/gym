import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { upsertBodyMetric } from '../../../lib/data/daily'
import { formatShort } from '../../../lib/dates'
import type { BodyMetric } from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { NumberField } from '../../components/NumberField'
import { Button, EmptyState, Row } from '../../components/core'

/**
 * Body-metric history (SPEC 26): one row per day with weight, waist and body
 * fat. Tap to edit (writes through upsertBodyMetric) or delete the day.
 */

interface Draft {
  weightKg: number | null
  waistCm: number | null
  bodyFatPct: number | null
}

export function BodyTab({ includeDemo }: { includeDemo: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const metrics = useLiveQuery(
    async () =>
      (await db.bodyMetrics.orderBy('dateKey').reverse().toArray()).filter(
        (m) => includeDemo || m.isDemo !== true,
      ),
    [includeDemo],
  )

  if (metrics === undefined) {
    return <p className="py-6 text-center text-[14px] text-text-muted">Loading body metrics…</p>
  }

  if (metrics.length === 0) {
    return (
      <EmptyState
        title="No body metrics yet"
        body="Morning weight, waist and body-fat entries appear here once you log them from the Today tab."
      />
    )
  }

  const selected = selectedId ? (metrics.find((m) => m.id === selectedId) ?? null) : null

  const open = (m: BodyMetric) => {
    setSelectedId(m.id)
    setDraft({ weightKg: m.weightKg, waistCm: m.waistCm, bodyFatPct: m.bodyFatPct })
  }

  const close = () => {
    setSelectedId(null)
    setDraft(null)
    setConfirmingDelete(false)
  }

  const save = async () => {
    if (!selected || !draft) return
    await upsertBodyMetric(selected.dateKey, draft)
    close()
  }

  const remove = async () => {
    if (!selected) return
    await db.bodyMetrics.delete(selected.id)
    close()
  }

  return (
    <div className="rounded-2xl border border-border bg-surface px-4">
      <div className="divide-y divide-border">
        {metrics.map((m) => (
          <Row
            key={m.id}
            onClick={() => open(m)}
            left={<span className="text-[14px]">{formatShort(m.dateKey)}</span>}
            right={
              <span className="tabular flex gap-3 text-[14px] text-text-muted">
                <span className={m.weightKg != null ? 'text-text' : ''}>
                  {m.weightKg != null ? `${m.weightKg} kg` : '—'}
                </span>
                <span>{m.waistCm != null ? `${m.waistCm} cm` : '—'}</span>
                <span>{m.bodyFatPct != null ? `${m.bodyFatPct}%` : '—'}</span>
              </span>
            }
          />
        ))}
      </div>

      <BottomSheet
        open={selected != null && draft != null && !confirmingDelete}
        onClose={close}
        title={selected ? `Body metrics · ${formatShort(selected.dateKey)}` : 'Body metrics'}
      >
        {selected && draft ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <NumberField
                wide
                label="Weight kg"
                value={draft.weightKg}
                step={0.1}
                onChange={(v) => setDraft({ ...draft, weightKg: v })}
              />
              <NumberField
                wide
                label="Waist cm"
                value={draft.waistCm}
                step={0.5}
                onChange={(v) => setDraft({ ...draft, waistCm: v })}
              />
              <NumberField
                wide
                label="Body fat %"
                value={draft.bodyFatPct}
                step={0.1}
                onChange={(v) => setDraft({ ...draft, bodyFatPct: v })}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
                Delete
              </Button>
              <Button variant="primary" className="flex-1" onClick={() => void save()}>
                Save changes
              </Button>
            </div>
          </div>
        ) : null}
      </BottomSheet>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this day's metrics?"
        body="Weight, waist and body fat for this day are removed. Trends and weekly check-in averages recalculate from the remaining entries."
        confirmLabel="Delete entry"
        danger
        onConfirm={() => void remove()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  )
}
