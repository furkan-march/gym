import { db } from '../../../lib/db'
import { formatShort } from '../../../lib/dates'
import { newId, nowIso } from '../../../lib/ids'
import { addSet, updateSet, type NewSetInput } from '../../../lib/data/workouts'
import {
  roundToIncrement,
  type ComparableSessionInput,
  type Recommendation,
} from '../../../lib/engines/progression'
import { playChime, primeAudio } from '../../audio'
import type {
  BodyweightMode,
  Exercise,
  ExerciseSession,
  PersonalRecord,
  PersonalRecordKind,
  RampStep,
  RecommendationResponse,
  SetLog,
  Side,
  TemplateKind,
  WorkoutSession,
} from '../../../lib/types'

/** Support utilities for the Active Workout screen (SPEC 8, 11–14, 17, 18). */

// ---------------------------------------------------------------------------
// Audio wrappers — jsdom's HTMLMediaElement.play() is not implemented, so the
// shared audio module can throw in tests; a missed chime must never break
// set logging.
// ---------------------------------------------------------------------------

export function safePrime(): void {
  try {
    primeAudio()
  } catch {
    /* audio unavailable (tests, restricted browsers) */
  }
}

export function safeChime(): void {
  try {
    playChime()
  } catch {
    /* audio unavailable */
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.floor(total))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function fmtKg(n: number): string {
  return String(Math.round(n * 100) / 100)
}

export function sortByOrder<T extends { orderIndex: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.orderIndex - b.orderIndex)
}

export function completedWorking(sets: SetLog[]): SetLog[] {
  return sortByOrder(sets.filter((s) => s.completed && !s.isWarmup))
}

/**
 * One-line previous-performance summary (SPEC 13), e.g.
 * "80 kg · 8, 8, 7 · 12 Jul" / "30 kg each · …" / "BW + 5 kg · …" /
 * "25 kg assistance · …". Unilateral sessions list both sides.
 */
export function formatComparableLine(entry: ComparableSessionInput): string {
  const working = completedWorking(entry.sets)
  const first = working[0]
  const date = formatShort(entry.session.dateKey)
  if (!first) return `No completed sets · ${date}`
  const load = (() => {
    switch (first.bodyweightMode) {
      case 'none': {
        if (first.loadKg == null) return '—'
        return `${fmtKg(first.loadKg)} kg${first.loadConvention === 'perDumbbell' ? ' each' : ''}`
      }
      case 'bodyweight':
        return 'BW'
      case 'added':
        return `BW + ${fmtKg(first.addedWeightKg ?? 0)} kg`
      case 'assistedMachine':
        return `${fmtKg(first.assistanceWeightKg ?? 0)} kg assistance`
      case 'assistedBand':
        return 'Band assisted'
    }
  })()
  const unilateral = working.some((s) => s.side != null)
  const reps = unilateral
    ? `L ${working
        .filter((s) => s.side === 'left')
        .map((s) => s.reps ?? 0)
        .join(', ')} · R ${working
        .filter((s) => s.side === 'right')
        .map((s) => s.reps ?? 0)
        .join(', ')}`
    : working.map((s) => s.reps ?? 0).join(', ')
  return `${load} · ${reps} · ${date}`
}

/** First number inside a historical-benchmark string ("~80 kg (late 2025)" → 80). */
export function benchmarkNumber(text: string): number | null {
  const m = /(\d+(?:\.\d+)?)/.exec(text)
  return m?.[1] != null ? Number(m[1]) : null
}

// ---------------------------------------------------------------------------
// History fetch for the progression engine
// ---------------------------------------------------------------------------

/**
 * Past sessions containing this exercise, newest first, as engine input.
 * Excludes the current session; excludes isDemo rows unless demo mode is on
 * (JS .filter — isDemo is not indexed, SPEC 34). Variant/equipment matching is
 * done by the engine's comparableHistory, so everything is included here.
 */
export async function fetchExerciseHistory(
  exerciseId: string,
  currentSessionId: string,
  includeDemo: boolean,
): Promise<ComparableSessionInput[]> {
  const allEs = await db.exerciseSessions.where('exerciseId').equals(exerciseId).toArray()
  const others = allEs.filter(
    (es) => es.workoutSessionId !== currentSessionId && (includeDemo || es.isDemo !== true),
  )
  if (others.length === 0) return []
  const sessionIds = [...new Set(others.map((es) => es.workoutSessionId))]
  const sessions = (await db.workoutSessions.bulkGet(sessionIds)).filter(
    (s): s is WorkoutSession =>
      s != null && s.status === 'completed' && (includeDemo || s.isDemo !== true),
  )
  const sessionById = new Map(sessions.map((s) => [s.id, s] as const))
  const feedbacks = await db.sessionFeedbacks
    .where('workoutSessionId')
    .anyOf([...sessionById.keys()])
    .toArray()
  const fbBySession = new Map(feedbacks.map((f) => [f.workoutSessionId, f] as const))
  const sets = await db.setLogs.where('exerciseId').equals(exerciseId).toArray()
  const setsByEs = new Map<string, SetLog[]>()
  for (const s of sets) {
    const list = setsByEs.get(s.exerciseSessionId)
    if (list) list.push(s)
    else setsByEs.set(s.exerciseSessionId, [s])
  }
  return others
    .filter((es) => sessionById.has(es.workoutSessionId))
    .map((es) => ({
      session: sessionById.get(es.workoutSessionId) as WorkoutSession,
      exerciseSession: es,
      sets: sortByOrder(setsByEs.get(es.id) ?? []),
      feedback: fbBySession.get(es.workoutSessionId) ?? null,
    }))
    .sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt))
}

// ---------------------------------------------------------------------------
// Progression responses (SPEC 14, recommendation lifecycle)
// ---------------------------------------------------------------------------

/** Deterministic id: re-answering the same recommendation upserts one row. */
export function respId(
  exerciseId: string,
  variantId: string | null,
  equipmentContextId: string | null,
  sourceSessionId: string,
): string {
  return `resp|${exerciseId}|${variantId ?? ''}|${equipmentContextId ?? ''}|${sourceSessionId}`
}

export async function storeProgressionResponse(
  es: ExerciseSession,
  rec: Recommendation,
  response: RecommendationResponse,
  editedLoadKg: number | null,
): Promise<void> {
  if (!rec.sourceSessionId) return
  await db.progressionResponses.put({
    id: respId(es.exerciseId, es.variantId, es.equipmentContextId, rec.sourceSessionId),
    exerciseId: es.exerciseId,
    variantId: es.variantId,
    equipmentContextId: es.equipmentContextId,
    sourceSessionId: rec.sourceSessionId,
    contentHash: rec.contentHash,
    response,
    editedLoadKg,
    respondedAt: nowIso(),
  })
}

/** How an accepted/edited suggested load maps onto set-row fields, per mode. */
export interface SuggestedApplication {
  mode: BodyweightMode
  loadKg: number | null
  addedWeightKg: number | null
  assistanceWeightKg: number | null
}

export function applicationFor(
  exercise: Exercise,
  baselineMode: BodyweightMode,
  rec: Recommendation,
  value: number | null,
): SuggestedApplication | null {
  if (value == null) return null
  if (exercise.kind === 'weighted') {
    return { mode: 'none', loadKg: value, addedWeightKg: null, assistanceWeightKg: null }
  }
  if (exercise.kind === 'repsOnly') return null
  // bodyweight exercise
  if (baselineMode === 'assistedMachine') {
    if (value <= 0 || rec.reasons.includes('transition-to-bodyweight')) {
      return { mode: 'bodyweight', loadKg: null, addedWeightKg: null, assistanceWeightKg: null }
    }
    return { mode: 'assistedMachine', loadKg: null, addedWeightKg: null, assistanceWeightKg: value }
  }
  if (baselineMode === 'added' || (baselineMode === 'bodyweight' && rec.kind === 'increase')) {
    return { mode: 'added', loadKg: null, addedWeightKg: value, assistanceWeightKg: null }
  }
  return null
}

// ---------------------------------------------------------------------------
// Lazy row creation and prefill (SPEC 8 RAMP-UP, SPEC 11 SET-LOGGING CONTRACT)
// ---------------------------------------------------------------------------

export interface CreateRowsOptions {
  es: ExerciseSession
  exercise: Exercise
  /** already gated by settings.rampSetsEnabled; [] = no ramp */
  rampScheme: RampStep[]
  baseline: ComparableSessionInput | null
  /** restored accepted/edited response, if any */
  application: SuggestedApplication | null
  /** true when the restored response was an accepted/edited increase */
  applyRepMin: boolean
}

/**
 * Create the prescribed rows for an exercise session exactly once: warm-up
 * ramp rows first (from the scheme × the working load, rounded to the
 * prescription increment; skipped when the load is unknown), then working
 * rows prefilled from the accepted recommendation or the matching set of the
 * last comparable session. Unilateral rows are side-paired L,R,L,R… with
 * prescribedSets per side (SPEC 8 PER-SIDE).
 */
export async function createInitialRows(opts: CreateRowsOptions): Promise<void> {
  const { es, exercise, rampScheme, baseline, application, applyRepMin } = opts
  const already = await db.setLogs.where('exerciseSessionId').equals(es.id).count()
  if (already > 0) return

  const p = es.prescription
  const last = baseline ? completedWorking(baseline.sets) : []
  const pools: Record<'left' | 'right' | 'none', SetLog[]> = {
    left: last.filter((s) => s.side === 'left'),
    right: last.filter((s) => s.side === 'right'),
    none: last.filter((s) => s.side == null),
  }

  const prefill = (i: number, side: Side | null): NewSetInput => {
    const pool = side ? pools[side] : pools.none.length > 0 ? pools.none : last
    const match = pool[i] ?? pool[pool.length - 1]
    const input: NewSetInput = { side }
    if (application) {
      input.bodyweightMode = application.mode
      input.loadKg = application.loadKg
      input.addedWeightKg = application.addedWeightKg
      input.assistanceWeightKg = application.assistanceWeightKg
      input.reps = applyRepMin ? p.repRangeMin : (match?.reps ?? null)
    } else if (match) {
      input.bodyweightMode = match.bodyweightMode
      input.loadKg = match.loadKg
      input.addedWeightKg = match.addedWeightKg
      input.assistanceWeightKg = match.assistanceWeightKg
      input.reps = match.reps
    }
    return input
  }

  // Ramp warm-ups (SPEC 8): weighted lifts scale off the working load;
  // bodyweight lifts (Pull-Up) get plain easy bodyweight sets.
  const firstPrefill = prefill(0, exercise.unilateral ? 'left' : null)
  const rampBase = exercise.kind === 'weighted' ? (firstPrefill.loadKg ?? null) : null
  for (const step of rampScheme) {
    if (exercise.kind === 'bodyweight') {
      await addSet(es, exercise, { isWarmup: true, reps: step.reps, bodyweightMode: 'bodyweight' })
    } else if (rampBase != null && step.pct > 0) {
      await addSet(es, exercise, {
        isWarmup: true,
        reps: step.reps,
        loadKg: roundToIncrement(step.pct * rampBase, p.incrementKg),
      })
    }
  }

  const sides: (Side | null)[] = exercise.unilateral ? ['left', 'right'] : [null]
  for (let i = 0; i < p.prescribedSets; i++) {
    for (const side of sides) {
      await addSet(es, exercise, prefill(i, side))
    }
  }
}

/**
 * Apply an accepted/edited recommendation to already-created rows: incomplete
 * working rows get the suggested load (mode-aware); incomplete ramp rows are
 * re-derived from the new working load.
 */
export async function applyResponseToRows(opts: {
  es: ExerciseSession
  exercise: Exercise
  application: SuggestedApplication
  applyRepMin: boolean
  rampScheme: RampStep[]
}): Promise<void> {
  const { es, exercise, application, applyRepMin, rampScheme } = opts
  const rows = sortByOrder(await db.setLogs.where('exerciseSessionId').equals(es.id).toArray())
  for (const row of rows) {
    if (row.isWarmup || row.completed) continue
    const patch: Partial<SetLog> = {
      bodyweightMode: application.mode,
      loadKg: application.loadKg,
      addedWeightKg: application.addedWeightKg,
      assistanceWeightKg: application.assistanceWeightKg,
    }
    if (applyRepMin) patch.reps = es.prescription.repRangeMin
    await updateSet(row.id, patch)
  }
  if (exercise.kind === 'weighted' && application.loadKg != null) {
    const warmups = rows.filter((r) => r.isWarmup)
    for (let i = 0; i < warmups.length && i < rampScheme.length; i++) {
      const row = warmups[i]
      const step = rampScheme[i]
      if (row && step && !row.completed && step.pct > 0) {
        await updateSet(row.id, {
          loadKg: roundToIncrement(step.pct * application.loadKg, es.prescription.incrementKg),
        })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Misc data helpers
// ---------------------------------------------------------------------------

export async function defaultVariantIdFor(exerciseId: string): Promise<string | null> {
  const variants = await db.exerciseVariants.where('exerciseId').equals(exerciseId).toArray()
  return (variants.find((v) => v.isDefault) ?? variants[0])?.id ?? null
}

export async function createEquipmentContext(fields: {
  gym?: string
  machineName?: string
  seatSetting?: string
  note?: string
}): Promise<string> {
  const t = nowIso()
  const id = newId()
  await db.equipmentContexts.add({ id, ...fields, createdAt: t, updatedAt: t })
  return id
}

// ---------------------------------------------------------------------------
// Finish flow (SPEC 17 AFTER A WORKOUT, SPEC 21)
// ---------------------------------------------------------------------------

export interface FinishContext {
  workoutSessionId: string
  templateKind: TemplateKind
  /** subtle "New record" lines for the feedback sheet; may be empty */
  prLines: string[]
}

export function describeRecord(r: PersonalRecord, name: string): string {
  switch (r.kind) {
    case 'heaviestLoad':
      return `${name} ${fmtKg(r.value)} kg`
    case 'best1RM':
      return `${name} ~${fmtKg(r.value)} kg est. 1RM`
    case 'mostRepsAtLoad':
      return `${name} ${r.value} reps at ${fmtKg(r.secondaryValue ?? 0)} kg`
    case 'bestSessionVolume':
      return `${name} ${fmtKg(r.value)} kg session volume`
    case 'bestSet':
      return `${name} best set ~${fmtKg(r.value)} kg est. 1RM`
    case 'bodyweightReps':
      return `${name} ${r.value} reps`
    case 'addedWeightPullup':
      return `${name} +${fmtKg(r.value)} kg added`
    case 'heaviestEffectiveLoad':
      return `${name} ${fmtKg(r.value)} kg effective load`
  }
}

const RECORD_PRIORITY: PersonalRecordKind[] = [
  'heaviestLoad',
  'addedWeightPullup',
  'bodyweightReps',
  'best1RM',
  'mostRepsAtLoad',
  'bestSet',
  'heaviestEffectiveLoad',
  'bestSessionVolume',
]

/** One line per exercise (strongest record kind first), capped at four. */
export function topRecordLines(records: PersonalRecord[], nameById: Map<string, string>): string[] {
  const byExercise = new Map<string, PersonalRecord>()
  for (const r of records) {
    const cur = byExercise.get(r.exerciseId)
    if (!cur || RECORD_PRIORITY.indexOf(r.kind) < RECORD_PRIORITY.indexOf(cur.kind)) {
      byExercise.set(r.exerciseId, r)
    }
  }
  return [...byExercise.values()]
    .slice(0, 4)
    .map((r) => describeRecord(r, nameById.get(r.exerciseId) ?? 'Exercise'))
}
