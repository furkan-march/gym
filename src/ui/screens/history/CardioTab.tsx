import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { formatShort } from '../../../lib/dates'
import { nowIso } from '../../../lib/ids'
import type { CardioSession, CardioType } from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { NumberField } from '../../components/NumberField'
import { Rating } from '../../components/Segmented'
import { Button, Card, Chip, EmptyState } from '../../components/core'
import { CARDIO_TYPE_LABELS } from './format'

/**
 * Cardio history (SPEC 26): chronological list; tap a session to edit or
 * delete it in a bottom sheet. Cardio has no derived records, so edits need
 * no rebuild step.
 */

const TYPES = Object.keys(CARDIO_TYPE_LABELS) as CardioType[]

interface Draft {
  type: CardioType
  minutes: number | null
  distanceKm: number | null
  avgHeartRate: number | null
  perceivedIntensity: number | null
  isZone2: boolean
}

function toDraft(c: CardioSession): Draft {
  return {
    type: c.type,
    minutes: c.minutes,
    distanceKm: c.distanceKm,
    avgHeartRate: c.avgHeartRate,
    perceivedIntensity: c.perceivedIntensity,
    isZone2: c.isZone2,
  }
}

export function CardioTab({ includeDemo }: { includeDemo: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const sessions = useLiveQuery(
    async () =>
      (await db.cardioSessions.toArray())
        .filter((c) => includeDemo || c.isDemo !== true)
        .sort((a, b) => {
          if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? 1 : -1
          return a.createdAt < b.createdAt ? 1 : -1
        }),
    [includeDemo],
  )

  if (sessions === undefined) {
    return <p className="py-6 text-center text-[14px] text-text-muted">Loading cardio…</p>
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No cardio yet"
        body="Zone 2 sessions and walks appear here once you log them from the Today tab."
      />
    )
  }

  const selected = selectedId ? (sessions.find((c) => c.id === selectedId) ?? null) : null

  const open = (c: CardioSession) => {
    setSelectedId(c.id)
    setDraft(toDraft(c))
  }

  const close = () => {
    setSelectedId(null)
    setDraft(null)
    setConfirmingDelete(false)
  }

  const save = async () => {
    if (!selected || !draft || draft.minutes == null || draft.minutes <= 0) return
    await db.cardioSessions.update(selected.id, {
      type: draft.type,
      minutes: draft.minutes,
      distanceKm: draft.distanceKm,
      avgHeartRate: draft.avgHeartRate,
      perceivedIntensity: draft.perceivedIntensity,
      isZone2: draft.isZone2,
      updatedAt: nowIso(),
    })
    close()
  }

  const remove = async () => {
    if (!selected) return
    await db.cardioSessions.delete(selected.id)
    close()
  }

  return (
    <div className="space-y-3">
      {sessions.map((c) => (
        <button key={c.id} onClick={() => open(c)} className="block w-full text-left">
          <Card>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[15px] font-medium">{CARDIO_TYPE_LABELS[c.type]}</span>
              <span className="tabular shrink-0 text-[13px] text-text-muted">
                {formatShort(c.dateKey)}
              </span>
            </div>
            <div className="tabular mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-text-muted">
              <span className="text-text">{c.minutes} min</span>
              {c.distanceKm != null ? <span>{c.distanceKm} km</span> : null}
              {c.avgHeartRate != null ? <span>{c.avgHeartRate} bpm avg</span> : null}
              {c.perceivedIntensity != null ? <span>Intensity {c.perceivedIntensity}/5</span> : null}
              {c.isZone2 ? (
                <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                  Zone 2
                </span>
              ) : null}
            </div>
            {c.notes ? <p className="mt-1 text-[13px] text-text-muted">{c.notes}</p> : null}
          </Card>
        </button>
      ))}

      <BottomSheet
        open={selected != null && draft != null && !confirmingDelete}
        onClose={close}
        title={selected ? `Cardio · ${formatShort(selected.dateKey)}` : 'Cardio'}
      >
        {selected && draft ? (
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-[11px] text-text-muted">Type</div>
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <Chip
                    key={t}
                    active={draft.type === t}
                    onClick={() => setDraft({ ...draft, type: t })}
                  >
                    {CARDIO_TYPE_LABELS[t]}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <NumberField
                wide
                label="Minutes"
                value={draft.minutes}
                step={5}
                onChange={(v) => setDraft({ ...draft, minutes: v })}
              />
              <NumberField
                wide
                label="Distance km"
                value={draft.distanceKm}
                step={0.5}
                onChange={(v) => setDraft({ ...draft, distanceKm: v })}
              />
              <NumberField
                wide
                label="Avg HR"
                value={draft.avgHeartRate}
                step={1}
                onChange={(v) => setDraft({ ...draft, avgHeartRate: v })}
              />
            </div>
            <Rating
              label="Intensity"
              value={draft.perceivedIntensity}
              onChange={(v) => setDraft({ ...draft, perceivedIntensity: v })}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px]">Zone 2 session</span>
              <Chip
                active={draft.isZone2}
                onClick={() => setDraft({ ...draft, isZone2: !draft.isZone2 })}
              >
                {draft.isZone2 ? 'Zone 2' : 'Not Zone 2'}
              </Chip>
            </div>
            <div className="flex gap-2">
              <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
                Delete
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={draft.minutes == null || draft.minutes <= 0}
                onClick={() => void save()}
              >
                Save changes
              </Button>
            </div>
          </div>
        ) : null}
      </BottomSheet>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this cardio session?"
        body="The session is removed from history and weekly totals. This cannot be undone."
        confirmLabel="Delete session"
        danger
        onConfirm={() => void remove()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  )
}
