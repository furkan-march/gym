import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { toDateKey, formatShort } from '../../../lib/dates'
import { newId, nowIso } from '../../../lib/ids'
import { updateSet } from '../../../lib/data/workouts'
import { rebuildPersonalRecords } from '../../../lib/engines/records'
import { workoutHistoryCsv } from '../../../lib/backup/csv'
import { exportFile, type ExportOutcome } from '../../../lib/backup/share'
import type { ExerciseSession, SetLog, WorkoutSession } from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { NumberField } from '../../components/NumberField'
import { Button } from '../../components/core'
import { formatDurationMin, formatSetLoad, formatVolumeKg, sessionVolumeKg } from './format'

/**
 * Workout-session detail (SPEC 26): per-exercise set tables in SPEC 13
 * formats, readiness + feedback, notes, and the edit / duplicate / delete /
 * export actions. Every edit rebuilds personal records so no derived data
 * goes stale; progression recommendations are computed on demand and
 * self-heal.
 */

const EXPORT_MESSAGES: Record<ExportOutcome, string> = {
  shared: 'Exported via share sheet.',
  downloaded: 'CSV downloaded.',
  clipboard: 'CSV copied to clipboard.',
  failed: 'Export did not finish — nothing was saved. Try again.',
}

const STATUS_LABELS: Partial<Record<ExerciseSession['status'], string>> = {
  skipped: 'Skipped',
  substituted: 'Substituted',
}

function byOrderIndex(a: { orderIndex: number }, b: { orderIndex: number }): number {
  return a.orderIndex - b.orderIndex
}

/** Which numeric field carries this set's editable load. */
function loadField(set: SetLog): 'loadKg' | 'addedWeightKg' | 'assistanceWeightKg' | null {
  switch (set.bodyweightMode) {
    case 'none':
      return 'loadKg'
    case 'added':
      return 'addedWeightKg'
    case 'assistedMachine':
    case 'assistedBand':
      return 'assistanceWeightKg'
    case 'bodyweight':
      return null
  }
}

async function editSetField(setId: string, patch: Partial<SetLog>): Promise<void> {
  await updateSet(setId, patch)
  // SPEC 26: never leave stale derived data after a history edit.
  await rebuildPersonalRecords(db)
}

async function duplicateSession(sessionId: string): Promise<void> {
  const t = nowIso()
  const today = toDateKey(new Date())
  await db.transaction('rw', [db.workoutSessions, db.exerciseSessions, db.setLogs], async () => {
    const src = await db.workoutSessions.get(sessionId)
    if (!src) return
    const ess = await db.exerciseSessions.where('workoutSessionId').equals(sessionId).toArray()
    const sets = await db.setLogs.where('workoutSessionId').equals(sessionId).toArray()

    const newSessionId = newId()
    const esIdMap = new Map(ess.map((es) => [es.id, newId()] as const))

    const sessionCopy: WorkoutSession = {
      ...src,
      id: newSessionId,
      dateKey: today,
      startedAt: t,
      finishedAt: t,
      status: 'completed',
      lastActivatedAt: null,
      createdAt: t,
      updatedAt: t,
    }
    delete sessionCopy.isDemo // a duplicate is real logged data, never demo
    await db.workoutSessions.add(sessionCopy)

    for (const es of ess) {
      const copy: ExerciseSession = {
        ...es,
        id: esIdMap.get(es.id) ?? newId(),
        workoutSessionId: newSessionId,
        substitutedByExerciseSessionId: es.substitutedByExerciseSessionId
          ? (esIdMap.get(es.substitutedByExerciseSessionId) ?? null)
          : null,
        substitutedFromExerciseSessionId: es.substitutedFromExerciseSessionId
          ? (esIdMap.get(es.substitutedFromExerciseSessionId) ?? null)
          : null,
        createdAt: t,
        updatedAt: t,
      }
      delete copy.isDemo
      await db.exerciseSessions.add(copy)
    }

    for (const set of sets) {
      const copy: SetLog = {
        ...set,
        id: newId(),
        workoutSessionId: newSessionId,
        exerciseSessionId: esIdMap.get(set.exerciseSessionId) ?? '',
        completedAt: set.completed ? t : null,
        createdAt: t,
        updatedAt: t,
      }
      delete copy.isDemo
      if (copy.exerciseSessionId) await db.setLogs.add(copy)
    }
  })
  await rebuildPersonalRecords(db)
}

async function deleteSession(sessionId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.workoutSessions, db.exerciseSessions, db.setLogs, db.sessionFeedbacks, db.readinessLogs],
    async () => {
      await db.setLogs.where('workoutSessionId').equals(sessionId).delete()
      await db.exerciseSessions.where('workoutSessionId').equals(sessionId).delete()
      await db.sessionFeedbacks.where('workoutSessionId').equals(sessionId).delete()
      await db.readinessLogs.where('workoutSessionId').equals(sessionId).delete()
      await db.workoutSessions.delete(sessionId)
    },
  )
  await rebuildPersonalRecords(db)
}

function SetRow({
  set,
  index,
  editing,
  incrementKg,
}: {
  set: SetLog
  index: number
  editing: boolean
  incrementKg: number
}) {
  const marker = set.isWarmup ? 'W' : String(index)
  const side = set.side === 'left' ? 'L' : set.side === 'right' ? 'R' : null
  const field = loadField(set)

  if (editing) {
    return (
      <div className={`flex items-center gap-2 py-1 ${set.completed ? '' : 'opacity-50'}`}>
        <span className="tabular w-8 shrink-0 text-[13px] text-text-muted">
          {marker}
          {side ? `·${side}` : ''}
        </span>
        {field ? (
          <NumberField
            wide
            label={field === 'loadKg' ? 'Load kg' : field === 'addedWeightKg' ? 'Added kg' : 'Assist kg'}
            value={set[field]}
            step={incrementKg}
            onChange={(v) => void editSetField(set.id, { [field]: v })}
          />
        ) : (
          <span className="flex-1 self-end pb-3 text-center text-[13px] text-text-muted">BW</span>
        )}
        <NumberField
          wide
          label="Reps"
          value={set.reps}
          step={1}
          onChange={(v) => void editSetField(set.id, { reps: v })}
        />
        <NumberField
          wide
          label="RIR"
          value={set.rir}
          step={1}
          onChange={(v) => void editSetField(set.id, { rir: v == null ? null : Math.min(5, v) })}
        />
      </div>
    )
  }

  return (
    <div
      className={`flex min-h-8 items-center gap-2 text-[14px] ${
        set.completed ? '' : 'text-text-muted opacity-60'
      }`}
    >
      <span className="tabular w-8 shrink-0 text-[13px] text-text-muted">
        {marker}
        {side ? `·${side}` : ''}
      </span>
      <span className="tabular flex-1">{formatSetLoad(set)}</span>
      <span className="tabular w-14 text-right">{set.reps ?? '—'} reps</span>
      <span className="tabular w-12 text-right text-text-muted">
        {set.rir != null ? `RIR ${set.rir}` : ''}
      </span>
      {!set.completed ? <span className="text-[11px]">not done</span> : null}
      {set.formQuality === 'poor' ? <span className="text-[11px] text-warning">form</span> : null}
      {set.painFlag ? <span className="text-[11px] text-danger">pain</span> : null}
    </div>
  )
}

export function SessionDetailSheet({
  sessionId,
  onClose,
}: {
  sessionId: string | null
  onClose: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const detail = useLiveQuery(async () => {
    if (!sessionId) return null
    const session = await db.workoutSessions.get(sessionId)
    if (!session) return null
    const [ess, sets, feedback, readiness] = await Promise.all([
      db.exerciseSessions.where('workoutSessionId').equals(sessionId).toArray(),
      db.setLogs.where('workoutSessionId').equals(sessionId).toArray(),
      db.sessionFeedbacks.where('workoutSessionId').equals(sessionId).first(),
      db.readinessLogs.where('workoutSessionId').equals(sessionId).first(),
    ])
    return {
      session,
      ess: ess.sort(byOrderIndex),
      sets,
      feedback: feedback ?? null,
      readiness: readiness ?? null,
    }
  }, [sessionId])

  const close = () => {
    setEditing(false)
    setConfirmingDelete(false)
    setStatusMessage(null)
    onClose()
  }

  const session = detail?.session ?? null

  const onDuplicate = async () => {
    if (!sessionId || busy) return
    setBusy(true)
    try {
      await duplicateSession(sessionId)
      setStatusMessage(`Duplicated to today (${formatShort(toDateKey(new Date()))}).`)
    } finally {
      setBusy(false)
    }
  }

  const onExport = async () => {
    if (!detail || !session || busy) return
    setBusy(true)
    try {
      const csv = workoutHistoryCsv([session], detail.ess, detail.sets)
      const outcome = await exportFile(`workout-${session.dateKey}.csv`, 'text/csv', csv)
      setStatusMessage(EXPORT_MESSAGES[outcome])
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async () => {
    if (!sessionId || busy) return
    setBusy(true)
    try {
      await deleteSession(sessionId)
    } finally {
      setBusy(false)
    }
    close()
  }

  return (
    <>
      <BottomSheet
        open={sessionId != null && !confirmingDelete}
        onClose={close}
        title={session ? `${session.templateName} · ${formatShort(session.dateKey)}` : 'Workout'}
      >
        {!detail || !session ? (
          <p className="py-6 text-center text-[14px] text-text-muted">Loading workout…</p>
        ) : (
          <div className="space-y-4">
            <div className="tabular flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-text-muted">
              <span>{formatDurationMin(session.activeSeconds)}</span>
              <span>{formatVolumeKg(sessionVolumeKg(detail.sets, session.bodyweightAtSessionKg))} volume</span>
              {session.bodyweightAtSessionKg != null ? (
                <span>BW {session.bodyweightAtSessionKg} kg</span>
              ) : null}
            </div>

            {detail.ess.map((es) => {
              const esSets = detail.sets
                .filter((s) => s.exerciseSessionId === es.id)
                .sort(byOrderIndex)
              let workingIndex = 0
              return (
                <div key={es.id} className="rounded-xl border border-border bg-surface-2 p-3">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="text-[15px] font-medium">
                      {es.exerciseName}
                      {es.variantName ? (
                        <span className="text-text-muted"> · {es.variantName}</span>
                      ) : null}
                    </span>
                    {STATUS_LABELS[es.status] ? (
                      <span className="text-[12px] text-text-muted">{STATUS_LABELS[es.status]}</span>
                    ) : null}
                  </div>
                  {esSets.length === 0 ? (
                    <p className="text-[13px] text-text-muted">No sets logged.</p>
                  ) : (
                    esSets.map((set) => {
                      if (!set.isWarmup) workingIndex += 1
                      return (
                        <SetRow
                          key={set.id}
                          set={set}
                          index={set.isWarmup ? 0 : workingIndex}
                          editing={editing}
                          incrementKg={es.prescription.incrementKg || 2.5}
                        />
                      )
                    })
                  )}
                  {es.note ? (
                    <p className="mt-1 text-[13px] text-text-muted">{es.note}</p>
                  ) : null}
                </div>
              )
            })}

            {detail.readiness ? (
              <div className="text-[13px] text-text-muted">
                <span className="font-medium text-text">Readiness · </span>
                <span className="tabular">
                  Sleep {detail.readiness.sleep} · Energy {detail.readiness.energy} · Motivation{' '}
                  {detail.readiness.motivation} · Soreness {detail.readiness.soreness} · Stress{' '}
                  {detail.readiness.stress}
                  {detail.readiness.kneeComfort != null
                    ? ` · Knee ${detail.readiness.kneeComfort}`
                    : ''}
                </span>
              </div>
            ) : null}

            {detail.feedback ? (
              <div className="text-[13px] text-text-muted">
                <span className="font-medium text-text">Feedback · </span>
                <span className="tabular">
                  {detail.feedback.difficulty != null
                    ? `Difficulty ${detail.feedback.difficulty}/5`
                    : 'No difficulty logged'}
                  {detail.feedback.jointDiscomfort
                    ? ` · Joints: ${detail.feedback.jointDiscomfort}`
                    : ''}
                  {detail.feedback.kneeComfortAfter != null
                    ? ` · Knee after ${detail.feedback.kneeComfortAfter}`
                    : ''}
                </span>
                {detail.feedback.note ? <p className="mt-0.5">{detail.feedback.note}</p> : null}
              </div>
            ) : null}

            {session.notes ? (
              <div className="text-[13px]">
                <span className="font-medium">Notes · </span>
                <span className="text-text-muted">{session.notes}</span>
              </div>
            ) : null}

            {statusMessage ? (
              <p className="text-[13px] text-accent" role="status">
                {statusMessage}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => setEditing((v) => !v)} disabled={busy}>
                {editing ? 'Done editing' : 'Edit sets'}
              </Button>
              <Button onClick={() => void onDuplicate()} disabled={busy}>
                Duplicate to today
              </Button>
              <Button onClick={() => void onExport()} disabled={busy}>
                Export CSV
              </Button>
              <Button variant="danger" onClick={() => setConfirmingDelete(true)} disabled={busy}>
                Delete
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this workout?"
        body="The session and all of its logged sets are removed, and personal records are recalculated. This cannot be undone."
        confirmLabel="Delete workout"
        danger
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  )
}
