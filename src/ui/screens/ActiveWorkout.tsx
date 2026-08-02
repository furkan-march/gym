import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import {
  addUnplannedExercise,
  discardWorkout,
  finishWorkout,
  reorderExercises,
  saveAndExit,
} from '../../lib/data/workouts'
import { estimateSessionMinutes, type EstimatorExercise } from '../../lib/engines/duration'
import { detectNewRecords, rebuildPersonalRecords } from '../../lib/engines/records'
import type {
  AppSettings,
  Exercise,
  SetLog,
  TemplateExercise,
  WorkoutSession,
} from '../../lib/types'
import { BottomSheet } from '../components/BottomSheet'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Button, EmptyState } from '../components/core'
import { useSettings } from '../hooks/useSettings'
import { useWakeLock } from '../hooks/useWakeLock'
import { ExerciseCard } from './workout/ExerciseCard'
import { RestTimerBar } from './workout/RestTimerBar'
import { StickyBar } from './workout/StickyBar'
import { WarmupChecklist } from './workout/WarmupChecklist'
import {
  defaultVariantIdFor,
  topRecordLines,
  type FinishContext,
} from './workout/helpers'
import { ExercisePicker, FinishSheet } from './workout/sheets'

/**
 * Active Workout screen (SPEC 11–14, 17, 18): single vertical list of exercise
 * cards with exactly one expanded, a sticky progress bar, warm-up checklist,
 * rest-timer overlay, and the finish/feedback flow. One-hand usable.
 */
export default function ActiveWorkoutScreen() {
  const navigate = useNavigate()
  const settings = useSettings()
  const session = useLiveQuery(async () => {
    const state = await db.activeWorkoutState.get('active')
    if (!state?.workoutSessionId) return null
    const s = await db.workoutSessions.get(state.workoutSessionId)
    return s && s.status === 'active' ? s : null
  }, [])
  const [finishCtx, setFinishCtx] = useState<FinishContext | 'pending' | null>(null)

  if (finishCtx && finishCtx !== 'pending') {
    return (
      <div className="pt-safe min-h-dvh px-4">
        <FinishSheet ctx={finishCtx} onDone={() => navigate('/')} />
      </div>
    )
  }
  if (session === undefined || settings === undefined || finishCtx === 'pending') {
    return (
      <div className="pt-safe px-4 py-16 text-center text-[14px] text-text-muted">
        {finishCtx === 'pending' ? 'Finishing workout…' : 'Loading…'}
      </div>
    )
  }
  if (session === null) {
    return (
      <div className="pt-safe min-h-dvh px-4 pt-16">
        <EmptyState
          title="No active workout"
          body="Start a workout from the Today screen and it will run here."
        />
        <Button variant="primary" className="mt-4 w-full" onClick={() => navigate('/')}>
          Go to Today
        </Button>
      </div>
    )
  }
  return (
    <WorkoutView
      session={session}
      settings={settings}
      onFinishStart={() => setFinishCtx('pending')}
      onFinished={setFinishCtx}
    />
  )
}

function WorkoutView({
  session,
  settings,
  onFinishStart,
  onFinished,
}: {
  session: WorkoutSession
  settings: AppSettings
  onFinishStart: () => void
  onFinished: (ctx: FinishContext) => void
}) {
  const navigate = useNavigate()
  const wake = useWakeLock(settings.keepScreenAwake)

  const ess = useLiveQuery(
    () => db.exerciseSessions.where('workoutSessionId').equals(session.id).toArray(),
    [session.id],
  )
  const sets = useLiveQuery(
    () => db.setLogs.where('workoutSessionId').equals(session.id).toArray(),
    [session.id],
  )
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const contexts = useLiveQuery(() => db.equipmentContexts.toArray(), [])
  const texs = useLiveQuery(
    () =>
      session.templateId
        ? db.templateExercises.where('templateId').equals(session.templateId).toArray()
        : Promise.resolve([] as TemplateExercise[]),
    [session.templateId],
  )
  const timer = useLiveQuery(() => db.restTimerState.get('rest'), [])

  const [expandedId, setExpandedId] = useState<string | null | undefined>(undefined)
  const [addOpen, setAddOpen] = useState(false)
  const [confirm, setConfirm] = useState<'finish' | 'discard' | null>(null)

  const exById = useMemo(
    () => new Map((exercises ?? []).map((e) => [e.id, e] as const)),
    [exercises],
  )
  const texByExercise = useMemo(() => {
    const map = new Map<string, TemplateExercise>()
    for (const t of texs ?? []) if (!map.has(t.exerciseId)) map.set(t.exerciseId, t)
    return map
  }, [texs])
  const visible = useMemo(
    () =>
      (ess ?? [])
        .filter((e) => e.status !== 'substituted')
        .sort((a, b) => a.orderIndex - b.orderIndex || a.createdAt.localeCompare(b.createdAt)),
    [ess],
  )
  const setsByEs = useMemo(() => {
    const map = new Map<string, SetLog[]>()
    for (const s of sets ?? []) {
      const list = map.get(s.exerciseSessionId)
      if (list) list.push(s)
      else map.set(s.exerciseSessionId, [s])
    }
    return map
  }, [sets])

  const progress = useMemo(() => {
    const perEs = new Map<string, { done: number; total: number }>()
    let completedTotal = 0
    let remainingTotal = 0
    for (const es of visible) {
      const factor = exById.get(es.exerciseId)?.unilateral ? 2 : 1
      const total = es.prescription.prescribedSets * factor
      const done = (setsByEs.get(es.id) ?? []).filter((s) => s.completed && !s.isWarmup).length
      perEs.set(es.id, { done, total })
      if (es.status !== 'skipped') {
        completedTotal += done
        remainingTotal += Math.max(0, total - done)
      }
    }
    return { perEs, completedTotal, remainingTotal }
  }, [visible, setsByEs, exById])

  const firstIncompleteId = useMemo(() => {
    for (const es of visible) {
      if (es.status === 'skipped') continue
      const p = progress.perEs.get(es.id)
      if (p && p.done < p.total) return es.id
    }
    return null
  }, [visible, progress])

  // Default expansion: first exercise with incomplete working sets (SPEC 11);
  // follow substitutions to the replacement, leave skipped cards collapsed.
  useEffect(() => {
    if (!ess) return
    if (expandedId === undefined) {
      setExpandedId(firstIncompleteId)
      return
    }
    if (!expandedId) return
    const cur = ess.find((e) => e.id === expandedId)
    if (!cur) return
    if (cur.status === 'substituted') {
      setExpandedId(cur.substitutedByExerciseSessionId ?? firstIncompleteId)
    } else if (cur.status === 'skipped') {
      setExpandedId(firstIncompleteId)
    }
  }, [ess, expandedId, firstIncompleteId])

  const estMinutes = useMemo(() => {
    if (!session.templateId || !texs || texs.length === 0) return null
    const est: EstimatorExercise[] = texs.flatMap((t) => {
      const exercise = exById.get(t.exerciseId)
      return exercise ? [{ ...t, exercise }] : []
    })
    if (est.length === 0) return null
    return estimateSessionMinutes({
      templateExercises: est,
      warmupMinutes: settings.warmupsVisible ? 10 : 0,
      rampSetsEnabled: settings.rampSetsEnabled,
    })
  }, [session.templateId, texs, exById, settings.warmupsVisible, settings.rampSetsEnabled])

  if (!ess || !sets || !exercises || !contexts || !texs) {
    return (
      <div className="pt-safe px-4 py-16 text-center text-[14px] text-text-muted">Loading…</div>
    )
  }

  const currentEs =
    visible.find((e) => e.id === expandedId) ?? visible.find((e) => e.id === firstIncompleteId)

  const jumpToCurrent = () => {
    const id = expandedId ?? firstIncompleteId
    if (!id) return
    setExpandedId(id)
    const el = document.getElementById(`excard-${id}`)
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  const move = (id: string, dir: -1 | 1) => {
    const ids = visible.map((v) => v.id)
    const i = ids.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= ids.length) return
    const a = ids[i]
    const b = ids[j]
    if (!a || !b) return
    ids[i] = b
    ids[j] = a
    void reorderExercises(ids)
  }

  const exit = async () => {
    await saveAndExit(session.id)
    navigate('/')
  }

  const discard = async () => {
    setConfirm(null)
    await discardWorkout(session.id)
    navigate('/')
  }

  /** SPEC 17 AFTER A WORKOUT + SPEC 21: finish, rebuild records, detect PRs. */
  const doFinish = async () => {
    onFinishStart()
    const before = await db.personalRecords.toArray()
    await finishWorkout(session.id)
    const after = await rebuildPersonalRecords(db)
    const fresh = detectNewRecords(before, after).filter(
      (r) => r.workoutSessionId === session.id,
    )
    const nameById = new Map(exercises.map((e) => [e.id, e.name] as const))
    onFinished({
      workoutSessionId: session.id,
      templateKind: session.templateKind,
      prLines: topRecordLines(fresh, nameById),
    })
  }

  const onFinishTap = () => {
    if (progress.remainingTotal > 0) setConfirm('finish')
    else void doFinish()
  }

  const addPicked = async (exercise: Exercise) => {
    const variantId = await defaultVariantIdFor(exercise.id)
    const es = await addUnplannedExercise(session.id, exercise, variantId)
    setAddOpen(false)
    setExpandedId(es.id)
  }

  const timerVisible =
    timer != null && (timer.endsAt != null || timer.pausedRemainingSeconds != null)

  return (
    <div className="min-h-dvh px-4 pb-44">
      <StickyBar
        session={session}
        estMinutes={estMinutes}
        completedSets={progress.completedTotal}
        remainingSets={progress.remainingTotal}
        currentName={currentEs?.exerciseName ?? null}
        onCurrentTap={jumpToCurrent}
        onFinish={onFinishTap}
        onExit={() => void exit()}
      />

      {settings.keepScreenAwake && !wake.active && (
        <p className="mt-2 px-1 text-[12px] text-text-muted">
          Screen may sleep — timer alerts can't fire while it's off.
        </p>
      )}

      {settings.warmupsVisible && (
        <div className="mt-3">
          <WarmupChecklist templateKind={session.templateKind} />
        </div>
      )}

      {session.templateKind === 'lower' && (
        <p className="mt-2 px-1 text-[11px] leading-snug text-text-muted">
          Use a comfortable, controlled range of motion. Stop or substitute the movement if you
          experience sharp pain, locking, instability, significant swelling, or worsening symptoms.
        </p>
      )}

      <div className="mt-3 grid gap-2">
        {visible.map((es, i) => {
          const exercise = exById.get(es.exerciseId)
          if (!exercise) return null
          return (
            <div key={es.id} id={`excard-${es.id}`} className="scroll-mt-28">
              <ExerciseCard
                es={es}
                exercise={exercise}
                tex={texByExercise.get(es.exerciseId) ?? null}
                sets={setsByEs.get(es.id) ?? []}
                settings={settings}
                contexts={contexts}
                allExercises={exercises}
                expanded={expandedId === es.id && es.status !== 'skipped'}
                onExpand={() => setExpandedId(es.id)}
                onCollapse={() => setExpandedId(null)}
                canMoveUp={i > 0}
                canMoveDown={i < visible.length - 1}
                onMove={(dir) => move(es.id, dir)}
              />
            </div>
          )
        })}
        {visible.length === 0 && (
          <EmptyState title="No exercises in this session" body="Add one below to get going." />
        )}
      </div>

      <div className="mt-3 grid gap-2">
        <Button onClick={() => setAddOpen(true)}>Add exercise</Button>
        <Button variant="danger" onClick={() => setConfirm('discard')}>
          Discard workout
        </Button>
      </div>

      {timerVisible && <RestTimerBar timer={timer} />}

      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title="Add exercise">
        <ExercisePicker exercises={exercises} onPick={(e) => void addPicked(e)} />
      </BottomSheet>

      <ConfirmDialog
        open={confirm === 'finish'}
        title={`${progress.remainingTotal} working ${
          progress.remainingTotal === 1 ? 'set' : 'sets'
        } not completed`}
        body="Finish anyway? Incomplete sets are simply not counted."
        confirmLabel="Finish workout"
        onConfirm={() => {
          setConfirm(null)
          void doFinish()
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'discard'}
        danger
        title="Discard this workout?"
        body="All sets logged in this session will be deleted. This cannot be undone."
        confirmLabel="Discard"
        onConfirm={() => void discard()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
