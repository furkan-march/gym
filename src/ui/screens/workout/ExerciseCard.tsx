import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { nowIso } from '../../../lib/ids'
import {
  addSet,
  completeSet,
  skipExercise,
  substituteExercise,
  uncompleteSet,
  unskipExercise,
  updateSet,
} from '../../../lib/data/workouts'
import {
  comparableHistory,
  recommend,
  type RecommendationInput,
} from '../../../lib/engines/progression'
import { startTimer } from '../../../lib/engines/restTimer'
import { RAMP_REST_SECONDS } from '../../../lib/engines/duration'
import { HISTORICAL_BENCHMARKS } from '../../../lib/seed/benchmarks'
import type {
  AppSettings,
  BodyweightMode,
  EquipmentContext,
  Exercise,
  ExerciseSession,
  RecommendationResponse,
  SetLog,
  TemplateExercise,
} from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { Button, Card } from '../../components/core'
import { NumberField } from '../../components/NumberField'
import { Segmented } from '../../components/Segmented'
import { SetRow } from './SetRow'
import {
  applicationFor,
  applyResponseToRows,
  benchmarkNumber,
  completedWorking,
  createEquipmentContext,
  createInitialRows,
  defaultVariantIdFor,
  fetchExerciseHistory,
  fmtKg,
  formatComparableLine,
  formatSeconds,
  respId,
  safePrime,
  sortByOrder,
  storeProgressionResponse,
} from './helpers'
import {
  EquipmentSheet,
  HistorySheet,
  NoteSheet,
  RowMenuSheet,
  SubstituteSheet,
  contextLabel,
} from './sheets'

type CardSheet = null | 'menu' | 'substitute' | 'history' | 'note' | 'equipment'

/**
 * One exercise card (SPEC 11 CARD LAYOUT): collapsed = single line with
 * progress; expanded = previous-session line, recommendation with
 * accept/edit/dismiss (SPEC 14), lazily created warm-up + working set rows,
 * and an overflow menu (substitute, history, note, equipment, skip, reorder).
 */
export function ExerciseCard({
  es,
  exercise,
  tex,
  sets,
  settings,
  contexts,
  allExercises,
  expanded,
  onExpand,
  onCollapse,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  es: ExerciseSession
  exercise: Exercise
  tex: TemplateExercise | null
  sets: SetLog[]
  settings: AppSettings
  contexts: EquipmentContext[]
  allExercises: Exercise[]
  expanded: boolean
  onExpand: () => void
  onCollapse: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (dir: -1 | 1) => void
}) {
  const [sheet, setSheet] = useState<CardSheet>(null)
  const [showReasons, setShowReasons] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editVal, setEditVal] = useState<number | null>(null)
  const [rowMenu, setRowMenu] = useState<{ setId: string; prevSetId: string | null } | null>(null)
  const createdRef = useRef(false)

  const p = es.prescription
  const skipped = es.status === 'skipped'
  const ordered = useMemo(() => sortByOrder(sets), [sets])
  const workingRows = useMemo(() => ordered.filter((s) => !s.isWarmup), [ordered])
  const doneCount = workingRows.filter((s) => s.completed).length
  const totalTarget = p.prescribedSets * (exercise.unilateral ? 2 : 1)
  const rampScheme = settings.rampSetsEnabled ? (tex?.rampScheme ?? []) : []

  // --- recommendation pipeline (computed only while expanded) ---------------
  const history = useLiveQuery(
    () =>
      expanded
        ? fetchExerciseHistory(exercise.id, es.workoutSessionId, settings.demoDataEnabled)
        : undefined,
    [expanded, exercise.id, es.workoutSessionId, settings.demoDataEnabled],
  )
  const recInput = useMemo<RecommendationInput | null>(
    () =>
      history
        ? {
            exercise,
            templateExercise: tex,
            currentPrescription: p,
            history,
            variantId: es.variantId,
            equipmentContextId: es.equipmentContextId,
          }
        : null,
    [history, exercise, tex, p, es.variantId, es.equipmentContextId],
  )
  const rec = useMemo(() => (recInput ? recommend(recInput) : undefined), [recInput])
  const comparable = useMemo(
    () => (recInput ? comparableHistory(recInput) : undefined),
    [recInput],
  )
  const baseline = comparable?.[0] ?? null
  const baselineMode: BodyweightMode = (() => {
    const first = baseline ? completedWorking(baseline.sets)[0] : undefined
    if (first) return first.bodyweightMode
    return exercise.kind === 'bodyweight' ? 'bodyweight' : 'none'
  })()

  // Restore a stored response for this exact recommendation (SPEC 14 lifecycle).
  const stored = useLiveQuery(async () => {
    if (!rec || !rec.sourceSessionId) return null
    const r = await db.progressionResponses.get(
      respId(es.exerciseId, es.variantId, es.equipmentContextId, rec.sourceSessionId),
    )
    return r && r.contentHash === rec.contentHash ? r : null
  }, [rec?.contentHash, rec?.sourceSessionId, es.exerciseId, es.variantId, es.equipmentContextId])

  // --- lazy row creation (SPEC 11): prescribed rows + ramp warm-ups ---------
  useEffect(() => {
    if (!expanded || createdRef.current) return
    if (es.status !== 'pending' && es.status !== 'inProgress') return
    if (!rec || comparable === undefined || stored === undefined) return
    if (sets.length > 0) {
      createdRef.current = true
      return
    }
    createdRef.current = true
    const app =
      stored && (stored.response === 'accepted' || stored.response === 'edited')
        ? applicationFor(
            exercise,
            baselineMode,
            rec,
            stored.response === 'edited' ? stored.editedLoadKg : rec.suggestedLoadKg,
          )
        : null
    void createInitialRows({
      es,
      exercise,
      rampScheme,
      baseline,
      application: app,
      applyRepMin: app != null && rec.kind === 'increase',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, es.status, rec, comparable, stored, sets.length])

  // --- handlers -------------------------------------------------------------

  const respond = async (response: RecommendationResponse, edited: number | null) => {
    if (!rec || !rec.sourceSessionId) return
    await storeProgressionResponse(es, rec, response, edited)
    if (response === 'dismissed') return
    const app = applicationFor(
      exercise,
      baselineMode,
      rec,
      response === 'edited' ? edited : rec.suggestedLoadKg,
    )
    if (app) {
      await applyResponseToRows({
        es,
        exercise,
        application: app,
        applyRepMin: rec.kind === 'increase',
        rampScheme,
      })
    }
  }

  const benchText = HISTORICAL_BENCHMARKS[exercise.id]
  const applyBenchmark = async () => {
    const n = benchText ? benchmarkNumber(benchText) : null
    if (n == null) return
    const rows = await db.setLogs.where('exerciseSessionId').equals(es.id).toArray()
    for (const row of rows) {
      if (row.isWarmup || row.completed) continue
      await updateSet(
        row.id,
        exercise.kind === 'weighted' ? { loadKg: n } : { reps: Math.round(n) },
      )
    }
  }

  const changeMode = async (mode: BodyweightMode) => {
    const rows = await db.setLogs.where('exerciseSessionId').equals(es.id).toArray()
    for (const row of rows) {
      if (row.isWarmup || row.completed) continue
      await updateSet(row.id, { bodyweightMode: mode })
    }
  }
  const currentMode: BodyweightMode =
    workingRows.find((r) => !r.completed)?.bodyweightMode ??
    workingRows[workingRows.length - 1]?.bodyweightMode ??
    'bodyweight'

  /** One tap logs the set and starts rest (SPEC 11/12). Unilateral rounds rest
   * after the second side (SPEC 8 PER-SIDE); warm-up timers follow settings. */
  const handleComplete = async (set: SetLog) => {
    safePrime()
    await completeSet(set.id, { loadKg: set.loadKg, reps: set.reps, rir: set.rir })
    if (!settings.autoStartRestTimer) return
    if (set.isWarmup && !settings.warmupTimersEnabled) return
    if (exercise.unilateral && !set.isWarmup) {
      const idx = workingRows.findIndex((s) => s.id === set.id)
      if (idx >= 0) {
        const partner = workingRows[idx % 2 === 0 ? idx + 1 : idx - 1]
        if (partner && partner.id !== set.id && !partner.completed) return
      }
    }
    const seconds = set.isWarmup ? RAMP_REST_SECONDS : p.restSeconds
    await db.restTimerState.put(startTimer(seconds, new Date(), es.id))
  }

  const handleUncomplete = (set: SetLog) => void uncompleteSet(set.id)

  const addExtraSet = async () => {
    const last = workingRows[workingRows.length - 1]
    await addSet(
      es,
      exercise,
      last
        ? {
            loadKg: last.loadKg,
            reps: last.reps,
            side: last.side,
            bodyweightMode: last.bodyweightMode,
            addedWeightKg: last.addedWeightKg,
            assistanceWeightKg: last.assistanceWeightKg,
          }
        : {},
    )
  }

  const substitute = async (target: Exercise) => {
    const variantId = await defaultVariantIdFor(target.id)
    await substituteExercise(es.id, target, variantId)
    setSheet(null)
  }

  const selectContext = async (ctxId: string | null) => {
    await db.exerciseSessions.update(es.id, { equipmentContextId: ctxId, updatedAt: nowIso() })
    const rows = await db.setLogs.where('exerciseSessionId').equals(es.id).toArray()
    for (const row of rows) await updateSet(row.id, { equipmentContextId: ctxId })
  }

  const startRestManually = async () => {
    await db.restTimerState.put(startTimer(p.restSeconds, new Date(), es.id))
    setSheet(null)
  }

  const onHeaderTap = () => {
    if (skipped) {
      void unskipExercise(es.id)
      onExpand()
      return
    }
    if (expanded) onCollapse()
    else onExpand()
  }

  // --- render ---------------------------------------------------------------

  const ctx = contexts.find((c) => c.id === es.equipmentContextId) ?? null
  const rirTxt = p.targetRIRMin === p.targetRIRMax ? `${p.targetRIRMin}` : `${p.targetRIRMin}–${p.targetRIRMax}`
  const alternatives = (tex?.alternativeExerciseIds ?? [])
    .map((id) => allExercises.find((e) => e.id === id))
    .filter((e): e is Exercise => e != null)

  let warmupNo = 0
  let workingNo = 0

  return (
    <Card className={`p-3 ${expanded ? 'border-accent/30' : ''}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={onHeaderTap}
          aria-expanded={expanded}
          className="min-h-11 min-w-0 flex-1 text-left"
        >
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[16px] font-semibold">{es.exerciseName}</span>
            {es.variantName && (
              <span className="flex-none text-[12px] text-text-muted">{es.variantName}</span>
            )}
          </div>
          {expanded ? (
            <div className="mt-0.5 text-[12px] text-text-muted">
              {p.prescribedSets}
              {exercise.unilateral ? ' × side' : ''} × {p.repRangeMin}–{p.repRangeMax} · RIR{' '}
              {rirTxt} · rest {formatSeconds(p.restSeconds)}
              {p.supersetGroup ? ' · superset' : ''}
              {p.isOptional ? ' · optional' : ''}
              {ctx ? ` · ${contextLabel(ctx)}` : ''}
            </div>
          ) : (
            <div className="mt-0.5 text-[12px] text-text-muted">
              {skipped ? 'Skipped — tap to restore' : `${doneCount}/${totalTarget} sets`}
            </div>
          )}
        </button>
        {!expanded && !skipped && (
          <span
            className={`tabular flex-none text-[13px] ${
              doneCount >= totalTarget ? 'font-semibold text-accent' : 'text-text-muted'
            }`}
          >
            {doneCount >= totalTarget ? '✓' : `${doneCount}/${totalTarget}`}
          </span>
        )}
        {expanded && (
          <button
            aria-label={`${es.exerciseName} options`}
            onClick={() => setSheet('menu')}
            className="min-h-11 min-w-11 flex-none rounded-xl text-[19px] text-text-muted active:bg-surface-2"
          >
            ⋯
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-2">
          {/* Previous performance + recommendation (SPEC 13/14) */}
          {history === undefined ? (
            <div className="py-2 text-[13px] text-text-muted">Loading history…</div>
          ) : rec && rec.kind === 'firstSession' ? (
            <div className="rounded-xl border border-dashed border-border p-3">
              <p className="text-[13px] text-text-muted">
                No history yet — pick a weight you can lift for the target reps at RIR 1–2
              </p>
              {benchText && (
                <button
                  onClick={() => void applyBenchmark()}
                  className="mt-2 min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-left text-[13px]"
                >
                  <span className="text-text-muted">Old benchmark — may not be current: </span>
                  {benchText}
                </button>
              )}
            </div>
          ) : (
            rec && (
              <div className="rounded-xl border border-border bg-surface-2 p-3">
                {baseline && (
                  <div className="tabular mb-1.5 text-[13px] text-text-muted">
                    Last session · {formatComparableLine(baseline)}
                  </div>
                )}
                <button
                  className="w-full text-left text-[14px] leading-snug"
                  onClick={() => setShowReasons((v) => !v)}
                >
                  {rec.explanation}
                </button>
                {showReasons && (
                  <ul className="mt-1.5 list-disc pl-4 text-[12px] text-text-muted">
                    {rec.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                {rec.sourceSessionId && (
                  <div className="mt-2 flex gap-1.5">
                    <Button
                      className={`flex-1 px-0 ${
                        stored?.response === 'accepted' ? 'border-accent text-accent' : ''
                      }`}
                      onClick={() => void respond('accepted', null)}
                    >
                      Accept{stored?.response === 'accepted' ? ' ✓' : ''}
                    </Button>
                    <Button
                      className={`flex-1 px-0 ${
                        stored?.response === 'edited' ? 'border-accent text-accent' : ''
                      }`}
                      onClick={() => {
                        setEditVal(
                          stored?.response === 'edited'
                            ? stored.editedLoadKg
                            : (rec.suggestedLoadKg ?? null),
                        )
                        setEditOpen((v) => !v)
                      }}
                    >
                      Edit
                      {stored?.response === 'edited'
                        ? ` (${fmtKg(stored.editedLoadKg ?? 0)} kg)`
                        : ''}
                    </Button>
                    <Button
                      variant="ghost"
                      className={`flex-1 px-0 ${
                        stored?.response === 'dismissed' ? 'text-text' : ''
                      }`}
                      onClick={() => void respond('dismissed', null)}
                    >
                      Dismiss{stored?.response === 'dismissed' ? ' ✓' : ''}
                    </Button>
                  </div>
                )}
                {editOpen && (
                  <div className="mt-2 flex items-end gap-2">
                    <NumberField
                      value={editVal}
                      onChange={setEditVal}
                      step={p.incrementKg > 0 ? p.incrementKg : 1}
                      label="Load (kg)"
                      wide
                    />
                    <Button
                      variant="primary"
                      onClick={() => {
                        void respond('edited', editVal)
                        setEditOpen(false)
                      }}
                    >
                      Apply
                    </Button>
                  </div>
                )}
              </div>
            )
          )}

          {/* Bodyweight mode (SPEC 15) */}
          {exercise.kind === 'bodyweight' && (
            <div className="mt-2">
              <Segmented<BodyweightMode>
                label="Load mode"
                value={currentMode}
                onChange={(m) => void changeMode(m)}
                options={[
                  { value: 'bodyweight', label: 'BW' },
                  { value: 'added', label: 'BW + kg' },
                  { value: 'assistedMachine', label: 'Assisted' },
                  { value: 'assistedBand', label: 'Band' },
                ]}
              />
            </div>
          )}

          {/* Set rows */}
          <div className="mt-2 grid gap-1.5">
            {ordered.length === 0 && (
              <div className="py-2 text-center text-[13px] text-text-muted">Preparing sets…</div>
            )}
            {ordered.map((set, i) => {
              const label = set.isWarmup ? `W${++warmupNo}` : String(++workingNo)
              const prev = ordered[i - 1]
              return (
                <SetRow
                  key={set.id}
                  set={set}
                  exercise={exercise}
                  incrementKg={p.incrementKg}
                  label={label}
                  rirVisible={settings.rirVisible}
                  prevSetId={prev?.id ?? null}
                  onComplete={(s) => void handleComplete(s)}
                  onUncomplete={handleUncomplete}
                  onMenu={(setId, prevSetId) => setRowMenu({ setId, prevSetId })}
                />
              )
            })}
          </div>
          {ordered.length > 0 && (
            <Button variant="ghost" className="mt-1.5 w-full" onClick={() => void addExtraSet()}>
              Add set
            </Button>
          )}
        </div>
      )}

      {/* Overflow menu (SPEC 11) */}
      <BottomSheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={es.exerciseName}>
        <div className="grid gap-1.5">
          <Button onClick={() => setSheet('substitute')}>Substitute exercise</Button>
          <Button onClick={() => setSheet('history')}>Exercise history</Button>
          <Button onClick={() => setSheet('note')}>
            Exercise note{es.note ? ' ·  saved' : ''}
          </Button>
          <Button onClick={() => setSheet('equipment')}>Equipment context</Button>
          <Button onClick={() => void startRestManually()}>
            Start rest timer ({formatSeconds(p.restSeconds)})
          </Button>
          <div className="flex gap-1.5">
            <Button disabled={!canMoveUp} className="flex-1" onClick={() => { onMove(-1); setSheet(null) }}>
              Move up
            </Button>
            <Button disabled={!canMoveDown} className="flex-1" onClick={() => { onMove(1); setSheet(null) }}>
              Move down
            </Button>
          </div>
          <Button
            variant="danger"
            onClick={() => {
              void skipExercise(es.id)
              setSheet(null)
              onCollapse()
            }}
          >
            Skip exercise
          </Button>
        </div>
      </BottomSheet>

      <SubstituteSheet
        open={sheet === 'substitute'}
        onClose={() => setSheet(null)}
        alternatives={alternatives}
        allExercises={allExercises}
        currentExerciseId={exercise.id}
        onPick={(e) => void substitute(e)}
      />
      <HistorySheet
        open={sheet === 'history'}
        onClose={() => setSheet(null)}
        title={es.exerciseName}
        lines={(comparable ?? []).slice(0, 5).map(formatComparableLine)}
      />
      <NoteSheet
        open={sheet === 'note'}
        onClose={() => setSheet(null)}
        title="Exercise note"
        initial={es.note ?? ''}
        onSave={(text) =>
          void db.exerciseSessions.update(es.id, {
            note: text || undefined,
            updatedAt: nowIso(),
          })
        }
      />
      <EquipmentSheet
        open={sheet === 'equipment'}
        onClose={() => setSheet(null)}
        contexts={contexts}
        selectedId={es.equipmentContextId}
        onSelect={(id) => void selectContext(id)}
        onCreate={(fields) =>
          void createEquipmentContext(fields).then((id) => selectContext(id))
        }
      />
      {rowMenu && (
        <RowMenuSheet
          set={ordered.find((s) => s.id === rowMenu.setId) ?? null}
          prevSet={rowMenu.prevSetId ? (ordered.find((s) => s.id === rowMenu.prevSetId) ?? null) : null}
          onClose={() => setRowMenu(null)}
        />
      )}
    </Card>
  )
}
