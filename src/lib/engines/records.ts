import type { GymDB } from '../db'
import type {
  Exercise,
  ExerciseSession,
  LoadConvention,
  PersonalRecord,
  PersonalRecordKind,
  SetLog,
  WorkoutSession,
} from '../types'
import { bestSessionE1rm, setE1rm } from './e1rm'
import { effectiveLoadKg } from './effectiveLoad'

/**
 * Personal-records engine (SPEC 21, 26, 34).
 *
 * Records are keyed by (exerciseId, variantId, equipmentContextId) so
 * incomparable variants or machine contexts never merge into one record
 * (SPEC 16/21); a null variant/context is its own key component. Dumbbell
 * loads are additionally only compared within one stored loadConvention.
 *
 * Derived rows are always recomputed from source logs (SPEC 26):
 * `rebuildPersonalRecords` replaces the personalRecords table wholesale so
 * nothing stale survives a history edit.
 */

/** Float tolerance so rebuild noise never reads as an "improvement". */
const EPS = 1e-9

export interface ComputeRecordsInput {
  sessions: WorkoutSession[]
  exerciseSessions: ExerciseSession[]
  sets: SetLog[]
  exercises: Exercise[]
  /** SPEC 34: demo rows only count while demo mode is active. Default false. */
  includeDemo?: boolean
}

/** Deterministic id — one row per (key, kind), stable across rebuilds. */
export function personalRecordId(
  exerciseId: string,
  variantId: string | null,
  equipmentContextId: string | null,
  kind: PersonalRecordKind,
): string {
  return `pr|${exerciseId}|${variantId ?? ''}|${equipmentContextId ?? ''}|${kind}`
}

interface ValidSet {
  set: SetLog
  session: WorkoutSession
  /** achievement timestamp: chronological tie-breaks and record createdAt */
  at: string
  demo: boolean
}

interface Group {
  exerciseId: string
  variantId: string | null
  equipmentContextId: string | null
  exercise: Exercise
  sets: ValidSet[]
}

function hasValidReps(set: SetLog): boolean {
  return set.reps != null && set.reps > 0
}

/**
 * Dumbbell loads are only comparable within one stored convention (SPEC 16:
 * stored history is never reinterpreted). To keep a single row per (key, kind)
 * — PersonalRecord has no convention field — a group holding several
 * conventions keeps perDumbbell rows (the app default), then combined.
 */
function preferredLoadSets(sets: ValidSet[]): ValidSet[] {
  let convention: LoadConvention | null = null
  for (const vs of sets) {
    if (vs.set.loadConvention === 'perDumbbell') {
      convention = 'perDumbbell'
      break
    }
    if (vs.set.loadConvention === 'combined') convention = 'combined'
  }
  return sets.filter((vs) => vs.set.loadConvention === convention)
}

function chronological(sets: ValidSet[]): ValidSet[] {
  return [...sets].sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? -1 : 1
    return a.set.orderIndex - b.set.orderIndex
  })
}

interface RankedSet {
  vs: ValidSet
  primary: number
  secondary: number
}

/**
 * Best set by (primary, secondary) rank. Scanned chronologically and replaced
 * only when strictly better, so a tie keeps the FIRST achievement — repeating
 * a record is not a new record.
 */
function bestSetBy(
  sets: ValidSet[],
  rank: (vs: ValidSet) => { primary: number; secondary: number } | null,
): RankedSet | null {
  let best: RankedSet | null = null
  for (const vs of chronological(sets)) {
    const r = rank(vs)
    if (r == null) continue
    if (
      best == null ||
      r.primary > best.primary ||
      (r.primary === best.primary && r.secondary > best.secondary)
    ) {
      best = { vs, primary: r.primary, secondary: r.secondary }
    }
  }
  return best
}

interface RecordSource {
  setLogId: string | null
  workoutSessionId: string
  dateKey: string
  at: string
  demo: boolean
}

function setSource(vs: ValidSet): RecordSource {
  return {
    setLogId: vs.set.id,
    workoutSessionId: vs.session.id,
    dateKey: vs.session.dateKey,
    at: vs.at,
    demo: vs.demo,
  }
}

function makeRecord(
  group: Group,
  kind: PersonalRecordKind,
  value: number,
  secondaryValue: number | null,
  source: RecordSource,
): PersonalRecord {
  const record: PersonalRecord = {
    id: personalRecordId(group.exerciseId, group.variantId, group.equipmentContextId, kind),
    exerciseId: group.exerciseId,
    variantId: group.variantId,
    equipmentContextId: group.equipmentContextId,
    kind,
    value,
    secondaryValue,
    setLogId: source.setLogId,
    workoutSessionId: source.workoutSessionId,
    dateKey: source.dateKey,
    createdAt: source.at,
  }
  if (source.demo) record.isDemo = true
  return record
}

function groupRecords(group: Group): PersonalRecord[] {
  const records: PersonalRecord[] = []
  const loadSets = preferredLoadSets(group.sets)

  // heaviestLoad — raw external load; meaningful for weighted exercises only.
  if (group.exercise.kind === 'weighted') {
    const best = bestSetBy(loadSets, (vs) =>
      vs.set.loadKg != null && vs.set.loadKg > 0 && hasValidReps(vs.set)
        ? { primary: vs.set.loadKg, secondary: 0 }
        : null,
    )
    if (best) {
      records.push(makeRecord(group, 'heaviestLoad', best.primary, best.vs.set.reps, setSource(best.vs)))
    }

    // mostRepsAtLoad — best reps at the HEAVIEST load logged (SPEC 21):
    // ranked by load first, then reps. value = reps, secondaryValue = load.
    const mostReps = bestSetBy(loadSets, (vs) =>
      vs.set.loadKg != null && vs.set.loadKg > 0 && hasValidReps(vs.set)
        ? { primary: vs.set.loadKg, secondary: vs.set.reps ?? 0 }
        : null,
    )
    if (mostReps) {
      records.push(
        makeRecord(group, 'mostRepsAtLoad', mostReps.secondary, mostReps.primary, setSource(mostReps.vs)),
      )
    }
  }

  // bestSet — highest single-set e1RM (per-dumbbell loads yield per-dumbbell
  // e1RM; bodyweight modes use the session bodyweight snapshot via setE1rm).
  const bestSingle = bestSetBy(loadSets, (vs) => {
    const v = setE1rm(vs.set, vs.session.bodyweightAtSessionKg)
    return v == null ? null : { primary: v, secondary: 0 }
  })
  if (bestSingle) {
    records.push(
      makeRecord(group, 'bestSet', bestSingle.primary, bestSingle.vs.set.reps, setSource(bestSingle.vs)),
    )
  }

  // Session-level kinds: group the comparable sets per session, chronologically.
  const bySession = new Map<string, { session: WorkoutSession; sets: ValidSet[] }>()
  for (const vs of loadSets) {
    let entry = bySession.get(vs.session.id)
    if (!entry) {
      entry = { session: vs.session, sets: [] }
      bySession.set(vs.session.id, entry)
    }
    entry.sets.push(vs)
  }
  const sessionsOrdered = [...bySession.values()].sort((a, b) => {
    if (a.session.startedAt !== b.session.startedAt) {
      return a.session.startedAt < b.session.startedAt ? -1 : 1
    }
    return a.session.id < b.session.id ? -1 : 1
  })

  // best1RM — best valid session e1RM (SPEC 20: best valid set of a session).
  let best1rm: { value: number; session: WorkoutSession; demo: boolean } | null = null
  for (const entry of sessionsOrdered) {
    const v = bestSessionE1rm(
      entry.sets.map((vs) => vs.set),
      entry.session.bodyweightAtSessionKg,
    )
    if (v != null && (best1rm == null || v > best1rm.value)) {
      best1rm = { value: v, session: entry.session, demo: entry.sets.some((vs) => vs.demo) }
    }
  }
  if (best1rm) {
    records.push(
      makeRecord(group, 'best1RM', best1rm.value, null, {
        setLogId: null,
        workoutSessionId: best1rm.session.id,
        dateKey: best1rm.session.dateKey,
        at: best1rm.session.startedAt,
        demo: best1rm.demo,
      }),
    )
  }

  // bestSessionVolume — sum of load × reps over completed working sets;
  // bodyweight modes use effective load; sets without a numeric load are
  // skipped, never guessed (SPEC 15).
  let bestVolume: { value: number; session: WorkoutSession; demo: boolean } | null = null
  for (const entry of sessionsOrdered) {
    let volume = 0
    let demo = false
    for (const vs of entry.sets) {
      if (!hasValidReps(vs.set)) continue
      const load = effectiveLoadKg(vs.set, entry.session.bodyweightAtSessionKg)
      if (load == null || load <= 0) continue
      volume += load * (vs.set.reps ?? 0)
      if (vs.demo) demo = true
    }
    if (volume > 0 && (bestVolume == null || volume > bestVolume.value)) {
      bestVolume = { value: volume, session: entry.session, demo }
    }
  }
  if (bestVolume) {
    records.push(
      makeRecord(group, 'bestSessionVolume', bestVolume.value, null, {
        setLogId: null,
        workoutSessionId: bestVolume.session.id,
        dateKey: bestVolume.session.dateKey,
        at: bestVolume.session.startedAt,
        demo: bestVolume.demo,
      }),
    )
  }

  // bodyweightReps — pure-bodyweight rep record; needs no load math, so it
  // still works when the session bodyweight snapshot is missing.
  const bwReps = bestSetBy(group.sets, (vs) =>
    vs.set.bodyweightMode === 'bodyweight' && hasValidReps(vs.set)
      ? { primary: vs.set.reps ?? 0, secondary: 0 }
      : null,
  )
  if (bwReps) {
    records.push(makeRecord(group, 'bodyweightReps', bwReps.primary, null, setSource(bwReps.vs)))
  }

  // addedWeightPullup — ranked by EXTERNAL added weight (SPEC 21), reps as
  // tie-break. Kept separate from effective-load so a heavier body never
  // masquerades as a heavier added-weight record.
  const added = bestSetBy(group.sets, (vs) =>
    vs.set.bodyweightMode === 'added' &&
    vs.set.addedWeightKg != null &&
    vs.set.addedWeightKg > 0 &&
    hasValidReps(vs.set)
      ? { primary: vs.set.addedWeightKg, secondary: vs.set.reps ?? 0 }
      : null,
  )
  if (added) {
    records.push(makeRecord(group, 'addedWeightPullup', added.primary, added.vs.set.reps, setSource(added.vs)))
  }

  // heaviestEffectiveLoad — bodyweight exercises, using session bodyweight
  // snapshots only (SPEC 15/21); tracked separately from added weight.
  if (group.exercise.kind === 'bodyweight') {
    const eff = bestSetBy(group.sets, (vs) => {
      if (!hasValidReps(vs.set)) return null
      const load = effectiveLoadKg(vs.set, vs.session.bodyweightAtSessionKg)
      return load != null && load > 0 ? { primary: load, secondary: 0 } : null
    })
    if (eff) {
      records.push(
        makeRecord(group, 'heaviestEffectiveLoad', eff.primary, eff.vs.set.reps, setSource(eff.vs)),
      )
    }
  }

  return records
}

/**
 * Compute all personal records from source logs. Pure: no clock, no db.
 * Warm-up and incomplete sets never count; discarded sessions never count;
 * demo rows count only when `includeDemo` is set (SPEC 34).
 */
export function computeRecords(input: ComputeRecordsInput): PersonalRecord[] {
  const includeDemo = input.includeDemo === true

  const sessionById = new Map<string, WorkoutSession>()
  for (const s of input.sessions) sessionById.set(s.id, s)
  const exerciseSessionById = new Map<string, ExerciseSession>()
  for (const es of input.exerciseSessions) exerciseSessionById.set(es.id, es)
  const exerciseById = new Map<string, Exercise>()
  for (const e of input.exercises) exerciseById.set(e.id, e)

  const groups = new Map<string, Group>()
  for (const set of input.sets) {
    if (!set.completed || set.isWarmup) continue
    const session = sessionById.get(set.workoutSessionId)
    if (!session || session.status === 'discarded') continue
    const exerciseSession = exerciseSessionById.get(set.exerciseSessionId)
    const demo =
      set.isDemo === true || session.isDemo === true || exerciseSession?.isDemo === true
    if (demo && !includeDemo) continue
    const exercise = exerciseById.get(set.exerciseId)
    if (!exercise) continue

    const key = `${set.exerciseId}|${set.variantId ?? ''}|${set.equipmentContextId ?? ''}`
    let group = groups.get(key)
    if (!group) {
      group = {
        exerciseId: set.exerciseId,
        variantId: set.variantId,
        equipmentContextId: set.equipmentContextId,
        exercise,
        sets: [],
      }
      groups.set(key, group)
    }
    group.sets.push({ set, session, at: set.completedAt ?? session.startedAt, demo })
  }

  const out: PersonalRecord[] = []
  for (const group of groups.values()) out.push(...groupRecords(group))
  return out
}

function recordKey(r: PersonalRecord): string {
  return `${r.exerciseId}|${r.variantId ?? ''}|${r.equipmentContextId ?? ''}|${r.kind}`
}

/** Per-kind "strictly better" — mirrors the ranking used in computeRecords. */
function isImprovement(current: PersonalRecord, previous: PersonalRecord): boolean {
  if (current.kind === 'mostRepsAtLoad') {
    // Ranked by load (secondaryValue) first, then reps (value).
    const currentLoad = current.secondaryValue ?? 0
    const previousLoad = previous.secondaryValue ?? 0
    if (currentLoad > previousLoad + EPS) return true
    if (currentLoad < previousLoad - EPS) return false
    return current.value > previous.value + EPS
  }
  if (current.kind === 'addedWeightPullup') {
    // Ranked by external added weight, then reps (secondaryValue).
    if (current.value > previous.value + EPS) return true
    if (current.value < previous.value - EPS) return false
    return (current.secondaryValue ?? 0) > (previous.secondaryValue ?? 0) + EPS
  }
  return current.value > previous.value + EPS
}

/**
 * Records that appeared or improved between two computed snapshots — feeds the
 * subtle celebration UI (SPEC 21). Ties and regressions are never "new".
 */
export function detectNewRecords(
  previous: PersonalRecord[],
  current: PersonalRecord[],
): PersonalRecord[] {
  const previousByKey = new Map<string, PersonalRecord>()
  for (const p of previous) previousByKey.set(recordKey(p), p)

  const out: PersonalRecord[] = []
  for (const c of current) {
    const p = previousByKey.get(recordKey(c))
    if (!p || isImprovement(c, p)) out.push(c)
  }
  return out
}

/**
 * Recompute every personal record from source logs and replace the
 * personalRecords table contents in one transaction (SPEC 26: derived data is
 * rebuilt, never left stale). Demo rows are included only while demo mode is
 * active (SPEC 34). All reads happen before any write; only Dexie promises are
 * awaited inside the transaction.
 */
export async function rebuildPersonalRecords(db: GymDB): Promise<PersonalRecord[]> {
  return db.transaction(
    'rw',
    [
      db.workoutSessions,
      db.exerciseSessions,
      db.setLogs,
      db.exercises,
      db.appSettings,
      db.personalRecords,
    ],
    async () => {
      const [sessions, exerciseSessions, sets, exercises, settings] = await Promise.all([
        db.workoutSessions.toArray(),
        db.exerciseSessions.toArray(),
        db.setLogs.toArray(),
        db.exercises.toArray(),
        db.appSettings.get('settings'),
      ])
      const records = computeRecords({
        sessions,
        exerciseSessions,
        sets,
        exercises,
        includeDemo: settings?.demoDataEnabled === true,
      })
      await db.personalRecords.clear()
      await db.personalRecords.bulkAdd(records)
      return records
    },
  )
}
