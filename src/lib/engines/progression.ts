import type {
  BodyweightMode,
  Exercise,
  ExerciseSession,
  PrescriptionSnapshot,
  SessionFeedback,
  SetLog,
  Side,
  TemplateExercise,
  WorkoutSession,
} from '../types'
import { bestSessionE1rm } from './e1rm'

/**
 * Progressive-overload engine (SPEC 14, 15, 16, 17).
 *
 * Pure functions over plain data. Recommendations are advice, never commands:
 * nothing here mutates history, and every result carries a plain-language
 * explanation plus machine-readable reasons.
 */

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export interface ComparableSessionInput {
  session: WorkoutSession
  exerciseSession: ExerciseSession
  sets: SetLog[]
  feedback: SessionFeedback | null
}

export interface RecommendationInput {
  exercise: Exercise
  templateExercise: TemplateExercise | null
  currentPrescription: PrescriptionSnapshot
  /** newest first; entries are already limited to the same exercise */
  history: ComparableSessionInput[]
  variantId: string | null
  equipmentContextId: string | null
}

export type RecommendationKind =
  | 'increase'
  | 'maintain'
  | 'firstSession'
  | 'blocked'
  | 'fatigue'
  | 'deload'

export interface Recommendation {
  kind: RecommendationKind
  suggestedLoadKg: number | null
  perSide: boolean
  repTarget: string | null
  explanation: string
  reasons: string[]
  contentHash: string
  sourceSessionId: string | null
}

export interface StallResult {
  kind: 'none' | 'fatigueNotice' | 'deloadSuggestion'
  explanation: string
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

const EPS = 1e-6

function fmt(n: number): string {
  // String(-0) is "0", so rounding artifacts never surface as "-0".
  return String(Math.round(n * 100) / 100)
}

/** Round a suggested load to the nearest multiple of the configured increment. */
export function roundToIncrement(valueKg: number, incrementKg: number): number {
  if (incrementKg <= 0) return Math.round(valueKg * 100) / 100
  return Math.round(Math.round(valueKg / incrementKg) * incrementKg * 100) / 100
}

/** Completed working sets in logged order; warm-ups are always ignored. */
function completedWorkingSets(sets: SetLog[]): SetLog[] {
  return sets.filter((s) => s.completed && !s.isWarmup).sort((a, b) => a.orderIndex - b.orderIndex)
}

function totalReps(sets: SetLog[]): number {
  return sets.reduce((acc, s) => acc + (s.reps ?? 0), 0)
}

function sessionMode(working: SetLog[]): BodyweightMode {
  return working[0]?.bodyweightMode ?? 'none'
}

/** The load dimension the double-progression rule operates on, per mode. */
function setLoadValue(s: SetLog): number | null {
  switch (s.bodyweightMode) {
    case 'none':
      return s.loadKg
    case 'added':
      return s.addedWeightKg ?? 0
    case 'assistedMachine':
      return s.assistanceWeightKg ?? 0
    case 'bodyweight':
    case 'assistedBand':
      return null
  }
}

function repsList(sets: SetLog[]): string {
  return sets.map((s) => String(s.reps ?? 0)).join(', ')
}

function djb2(str: string): string {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
}

function sealed(r: Omit<Recommendation, 'contentHash'>): Recommendation {
  const contentHash = djb2(
    JSON.stringify([
      r.kind,
      r.suggestedLoadKg,
      r.perSide,
      r.repTarget,
      r.explanation,
      r.reasons,
      r.sourceSessionId,
    ]),
  )
  return { ...r, contentHash }
}

// ---------------------------------------------------------------------------
// Comparability filter (SPEC 14 RULE CLARIFICATIONS, SPEC 16)
// ---------------------------------------------------------------------------

/**
 * Comparable sessions: completed workout, same variant; equipment contexts must
 * match when BOTH are recorded (a session with no recorded context is
 * comparable to anything); for bodyweight exercises the bodyweight mode must
 * match the most recent comparable session's mode. Sessions with zero
 * completed working sets carry no evidence and are skipped.
 */
export function comparableHistory(input: RecommendationInput): ComparableSessionInput[] {
  const base = input.history.filter((h) => {
    if (h.session.status !== 'completed') return false
    if (h.exerciseSession.variantId !== input.variantId) return false
    const ctx = h.exerciseSession.equipmentContextId
    if (input.equipmentContextId != null && ctx != null && ctx !== input.equipmentContextId) {
      return false
    }
    return completedWorkingSets(h.sets).length > 0
  })
  if (input.exercise.kind !== 'bodyweight') return base
  const newest = base[0]
  if (!newest) return base
  const refMode = sessionMode(completedWorkingSets(newest.sets))
  return base.filter((h) => sessionMode(completedWorkingSets(h.sets)) === refMode)
}

// ---------------------------------------------------------------------------
// Per-side evaluation of the increase condition
// ---------------------------------------------------------------------------

interface SideEval {
  side: Side | null
  /** first prescribed-count completed working sets, logged order (extras never count) */
  counted: SetLog[]
  complete: boolean
  allAtTop: boolean
  avgRir: number | null
  rirOk: boolean
  qualifies: boolean
  totalReps: number
}

function evaluateSide(working: SetLog[], p: PrescriptionSnapshot, side: Side | null): SideEval {
  const pool = side == null ? working : working.filter((s) => s.side === side)
  const counted = pool.slice(0, p.prescribedSets)
  const complete = counted.length >= p.prescribedSets
  const allAtTop = complete && counted.every((s) => (s.reps ?? 0) >= p.repRangeMax)
  const withRir = counted.filter((s) => s.rir != null)
  const avgRir =
    withRir.length > 0 ? withRir.reduce((acc, s) => acc + (s.rir ?? 0), 0) / withRir.length : null
  // Missing RIR never blocks; an explicit average below 1 does.
  const rirOk = avgRir == null || avgRir >= 1
  return {
    side,
    counted,
    complete,
    allAtTop,
    avgRir,
    rirOk,
    qualifies: complete && allAtTop && rirOk,
    totalReps: totalReps(counted),
  }
}

function representativeLoad(
  sideEvals: SideEval[],
  working: SetLog[],
  mode: BodyweightMode,
): number | null {
  const firsts = sideEvals
    .map((e) => e.counted[0])
    .filter((s): s is SetLog => s != null)
  const vals = firsts.map(setLoadValue).filter((v): v is number => v != null)
  if (vals.length === 0) {
    const first = working[0]
    return first ? setLoadValue(first) : null
  }
  // Weaker side limits: lowest load — except assistance, where MORE assistance is weaker.
  return mode === 'assistedMachine' ? Math.max(...vals) : Math.min(...vals)
}

function loadDescriptor(
  mode: BodyweightMode,
  loadVal: number | null,
  perDumbbell: boolean,
): string {
  switch (mode) {
    case 'none':
      if (loadVal == null) return 'bodyweight'
      return `${fmt(loadVal)} kg${perDumbbell ? ' per dumbbell' : ''}`
    case 'bodyweight':
      return 'bodyweight'
    case 'added':
      return loadVal != null && loadVal > 0 ? `bodyweight + ${fmt(loadVal)} kg` : 'bodyweight'
    case 'assistedMachine':
      return `${fmt(loadVal ?? 0)} kg assistance`
    case 'assistedBand':
      return 'band assistance'
  }
}

/** The load a "maintain"-style recommendation carries, per mode (null = no numeric load). */
function maintainLoad(mode: BodyweightMode, loadVal: number | null): number | null {
  switch (mode) {
    case 'none':
    case 'added':
    case 'assistedMachine':
      return loadVal
    case 'bodyweight':
    case 'assistedBand':
      return null
  }
}

// ---------------------------------------------------------------------------
// recommend (SPEC 14 / 15 / 17)
// ---------------------------------------------------------------------------

export function recommend(input: RecommendationInput): Recommendation {
  const { exercise, currentPrescription: cur } = input
  const perSide = exercise.unilateral
  const incrementKg = input.templateExercise?.incrementKg ?? exercise.defaultIncrementKg
  const comparable = comparableHistory(input)
  const baseline = comparable[0]

  if (!baseline) {
    return sealed({
      kind: 'firstSession',
      suggestedLoadKg: null,
      perSide,
      repTarget: `aim for ${cur.prescribedSets} sets of ${cur.repRangeMin}-${cur.repRangeMax}`,
      explanation:
        'No comparable previous session for this exercise, variant, and equipment. Start conservatively and log your sets - this session becomes the baseline.',
      reasons: ['no-comparable-history'],
      sourceSessionId: null,
    })
  }

  const sourceSessionId = baseline.session.id
  // Snapshot basis: the compared session is judged by ITS OWN prescription,
  // never by the current template (SPEC 14, "Prescription basis").
  const p = baseline.exerciseSession.prescription
  const working = completedWorkingSets(baseline.sets)
  const mode: BodyweightMode = exercise.kind === 'bodyweight' ? sessionMode(working) : 'none'
  const perDumbbell = working.some((s) => s.loadConvention === 'perDumbbell')

  // --- hard blocks: session joint discomfort (SPEC 17), pain / poor form (SPEC 14 rule 7) ---
  const discomfort = baseline.feedback?.jointDiscomfort ?? null
  if (discomfort === 'moderate' || discomfort === 'severe') {
    return sealed({
      kind: 'blocked',
      suggestedLoadKg: null,
      perSide,
      repTarget: null,
      explanation: `${discomfort === 'moderate' ? 'Moderate' : 'Severe'} joint discomfort was reported after the last session, so no progression is suggested. Consider reviewing range of motion, load, technique, or exercise choice.`,
      reasons: [`joint-discomfort-${discomfort}`],
      sourceSessionId,
    })
  }
  const painFlagged = working.some((s) => s.painFlag)
  const poorForm = working.some((s) => s.formQuality === 'poor')
  if (painFlagged || poorForm) {
    const reasons: string[] = []
    if (painFlagged) reasons.push('pain-flagged')
    if (poorForm) reasons.push('poor-form')
    return sealed({
      kind: 'blocked',
      suggestedLoadKg: null,
      perSide,
      repTarget: null,
      explanation: painFlagged
        ? 'Pain was logged during the previous session. Repeat, reduce, or substitute rather than progressing automatically.'
        : 'Poor form was flagged during the previous session. Keep the load and focus on technique before progressing.',
      reasons,
      sourceSessionId,
    })
  }

  const sideEvals: SideEval[] = perSide
    ? [evaluateSide(working, p, 'left'), evaluateSide(working, p, 'right')]
    : [evaluateSide(working, p, null)]
  const allQualify = sideEvals.every((e) => e.qualifies)
  const loadVal = representativeLoad(sideEvals, working, mode)

  const countedAll = sideEvals.flatMap((e) => e.counted)
  const withRir = countedAll.filter((s) => s.rir != null)
  const avgRir =
    withRir.length > 0 ? withRir.reduce((acc, s) => acc + (s.rir ?? 0), 0) / withRir.length : null
  const rirTxt = avgRir == null ? '' : ` (avg RIR ${fmt(Math.round(avgRir * 10) / 10)})`
  const rirReason = avgRir == null ? 'rir-not-logged' : 'avg-rir-acceptable'

  const narration = buildNarration(exercise, mode, working, sideEvals, perDumbbell, loadVal)
  const incTarget = `aim for ${cur.prescribedSets} sets of ${cur.repRangeMin}+`

  if (allQualify) {
    if (exercise.kind === 'repsOnly') {
      return sealed({
        kind: 'increase',
        suggestedLoadKg: null,
        perSide,
        repTarget: incTarget,
        explanation: `${narration}${rirTxt}. All sets reached the top of the range - try a harder variant of ${exercise.name} next; rep-only movements progress by difficulty, not load.`,
        reasons: ['all-sets-at-top-of-range', rirReason, 'suggest-harder-variant'],
        sourceSessionId,
      })
    }
    switch (mode) {
      case 'none': {
        const next = roundToIncrement((loadVal ?? 0) + incrementKg, incrementKg)
        return sealed({
          kind: 'increase',
          suggestedLoadKg: next,
          perSide,
          repTarget: incTarget,
          explanation: `${narration}${rirTxt}. Increase to ${fmt(next)} kg${perDumbbell ? ' per dumbbell' : ''}${perSide ? ' per side' : ''} and ${incTarget}.`,
          reasons: ['all-sets-at-top-of-range', rirReason, 'increase-load'],
          sourceSessionId,
        })
      }
      case 'bodyweight': {
        const next = roundToIncrement(incrementKg, incrementKg)
        return sealed({
          kind: 'increase',
          suggestedLoadKg: next,
          perSide,
          repTarget: incTarget,
          explanation: `${narration}${rirTxt}. Add ${fmt(next)} kg of external load and ${incTarget}.`,
          reasons: ['all-sets-at-top-of-range', rirReason, 'add-external-load'],
          sourceSessionId,
        })
      }
      case 'added': {
        const next = roundToIncrement((loadVal ?? 0) + incrementKg, incrementKg)
        return sealed({
          kind: 'increase',
          suggestedLoadKg: next,
          perSide,
          repTarget: incTarget,
          explanation: `${narration}${rirTxt}. Increase added weight to ${fmt(next)} kg and ${incTarget}.`,
          reasons: ['all-sets-at-top-of-range', rirReason, 'increase-load'],
          sourceSessionId,
        })
      }
      case 'assistedMachine': {
        const next = Math.max(0, roundToIncrement((loadVal ?? 0) - incrementKg, incrementKg))
        if (next <= EPS) {
          return sealed({
            kind: 'increase',
            suggestedLoadKg: 0,
            perSide,
            repTarget: incTarget,
            explanation: `${narration}${rirTxt}. Assistance reaches 0 - switch to unassisted bodyweight and ${incTarget}.`,
            reasons: [
              'all-sets-at-top-of-range',
              rirReason,
              'reduce-assistance',
              'transition-to-bodyweight',
            ],
            sourceSessionId,
          })
        }
        return sealed({
          kind: 'increase',
          suggestedLoadKg: next,
          perSide,
          repTarget: incTarget,
          explanation: `${narration}${rirTxt}. Reduce assistance to ${fmt(next)} kg and ${incTarget}.`,
          reasons: ['all-sets-at-top-of-range', rirReason, 'reduce-assistance'],
          sourceSessionId,
        })
      }
      case 'assistedBand': {
        // Never a numeric recommendation for band assistance (SPEC 15).
        return sealed({
          kind: 'increase',
          suggestedLoadKg: null,
          perSide,
          repTarget: incTarget,
          explanation: `${narration}${rirTxt}. Move to a lighter band and ${incTarget} - band assistance never gets a numeric load target.`,
          reasons: ['all-sets-at-top-of-range', rirReason, 'suggest-lighter-band'],
          sourceSessionId,
        })
      }
    }
  }

  // --- fatigue / stall (SPEC 14 FATIGUE AND STALL LOGIC) ---
  const stall = detectStall(comparable)
  if (stall.kind === 'deloadSuggestion') {
    return sealed({
      kind: 'deload',
      suggestedLoadKg: null,
      perSide,
      repTarget: null,
      explanation: `${narration}. ${stall.explanation}`,
      reasons: ['three-stalled-or-declining-sessions'],
      sourceSessionId,
    })
  }
  if (stall.kind === 'fatigueNotice') {
    return sealed({
      kind: 'fatigue',
      suggestedLoadKg: maintainLoad(mode, loadVal),
      perSide,
      repTarget: null,
      explanation: `${narration}. ${stall.explanation}`,
      reasons: ['two-consecutive-declines'],
      sourceSessionId,
    })
  }

  // --- maintain paths ---
  if (perSide) {
    const failing = sideEvals.filter((e) => !e.qualifies)
    if (failing.length === 1) {
      const side: Side = failing[0]?.side === 'left' ? 'left' : 'right'
      return sealed({
        kind: 'maintain',
        suggestedLoadKg: maintainLoad(mode, loadVal),
        perSide,
        repTarget: `aim for ${cur.repRangeMax} reps on the ${side} side`,
        explanation: `${narration}. The ${side} side is limiting - keep the load and bring both sides to ${p.repRangeMax} reps before increasing.`,
        reasons: [`${side}-side-limiting`],
        sourceSessionId,
      })
    }
  }

  if (sideEvals.some((e) => !e.complete)) {
    const done = sideEvals[0]?.counted.length ?? 0
    return sealed({
      kind: 'maintain',
      suggestedLoadKg: maintainLoad(mode, loadVal),
      perSide,
      repTarget: `aim for ${cur.prescribedSets} sets of ${cur.repRangeMin}-${cur.repRangeMax}`,
      explanation: perSide
        ? `You completed fewer than the planned ${p.prescribedSets} working sets per side last time. No load increase is recommended yet.`
        : `You completed fewer than the planned working sets last time (${done} of ${p.prescribedSets}). No load increase is recommended yet.`,
      reasons: ['incomplete-sets'],
      sourceSessionId,
    })
  }

  if (sideEvals.every((e) => e.allAtTop)) {
    // Top of range reached, but average RIR below 1 blocks the increase.
    return sealed({
      kind: 'maintain',
      suggestedLoadKg: maintainLoad(mode, loadVal),
      perSide,
      repTarget: `aim for ${cur.prescribedSets} sets of ${cur.repRangeMax}`,
      explanation: `${narration}${rirTxt}. Keep the load until the top of the range feels like at least 1 rep in reserve.`,
      reasons: ['avg-rir-below-1'],
      sourceSessionId,
    })
  }

  const weakestTotal = Math.min(...sideEvals.map((e) => e.totalReps))
  const target = Math.min(weakestTotal + 1, cur.prescribedSets * cur.repRangeMax)
  const perSideTxt = perSide ? ' per side' : ''
  if (exercise.kind === 'repsOnly') {
    return sealed({
      kind: 'maintain',
      suggestedLoadKg: null,
      perSide,
      repTarget: `aim for at least ${target} total reps${perSideTxt}`,
      explanation: `${narration}. Add 1-2 total reps and aim for at least ${target} total reps.`,
      reasons: ['below-top-of-range', 'reps-only'],
      sourceSessionId,
    })
  }
  const keepDesc =
    mode === 'assistedBand' ? 'the same band' : loadDescriptor(mode, loadVal, perDumbbell)
  return sealed({
    kind: 'maintain',
    suggestedLoadKg: maintainLoad(mode, loadVal),
    perSide,
    repTarget: `aim for at least ${target} total reps${perSideTxt}`,
    explanation: `${narration}. Keep ${keepDesc} and aim for at least ${target} total reps${perSideTxt}.`,
    reasons: ['below-top-of-range'],
    sourceSessionId,
  })
}

function buildNarration(
  exercise: Exercise,
  mode: BodyweightMode,
  working: SetLog[],
  sideEvals: SideEval[],
  perDumbbell: boolean,
  loadVal: number | null,
): string {
  if (exercise.unilateral) {
    const left = sideEvals.find((e) => e.side === 'left')
    const right = sideEvals.find((e) => e.side === 'right')
    return `Last time: left ${repsList(left?.counted ?? [])} and right ${repsList(right?.counted ?? [])} at ${loadDescriptor(mode, loadVal, perDumbbell)}`
  }
  const counted = sideEvals[0]?.counted ?? working
  if (exercise.kind === 'repsOnly') {
    return `Last time: ${repsList(counted)} reps`
  }
  return `Last time: ${loadDescriptor(mode, loadVal, perDumbbell)} for ${repsList(counted)}`
}

// ---------------------------------------------------------------------------
// detectStall (SPEC 14 FATIGUE AND STALL LOGIC)
// ---------------------------------------------------------------------------

const FATIGUE_TEXT =
  'Performance on this exercise has declined for two comparable sessions in a row. Consider maintaining the current load. Sleep, recovery, a calorie deficit, or low readiness on the day can all contribute - this is context, not a diagnosis of overtraining.'

const DELOAD_TEXT =
  'This exercise has been stalled or declining for three comparable sessions. Options to consider: reduce the load by about 5-7.5%, temporarily remove one working set, take a deload week, improve sleep and recovery, confirm technique and range of motion, or substitute the movement if joint discomfort is involved. Nothing is changed automatically.'

type PairTrend = 'improve' | 'stall' | 'decline' | 'reset'

/** The session's position on its load dimension; bigger = harder. Null = no numeric dimension. */
function sessionLoadKey(working: SetLog[]): number | null {
  switch (sessionMode(working)) {
    case 'none': {
      const loads = working.map((s) => s.loadKg).filter((v): v is number => v != null)
      return loads.length > 0 ? Math.max(...loads) : null
    }
    case 'added': {
      return working.length > 0 ? Math.max(...working.map((s) => s.addedWeightKg ?? 0)) : null
    }
    case 'assistedMachine': {
      // Less assistance is harder, so negate: a reduced assistance reads as a load increase.
      return working.length > 0 ? -Math.min(...working.map((s) => s.assistanceWeightKg ?? 0)) : null
    }
    case 'bodyweight':
    case 'assistedBand':
      return null
  }
}

function sessionBodyweight(
  entry: ComparableSessionInput,
  bodyweights?: ReadonlyMap<string, number | null>,
): number | null {
  return entry.session.bodyweightAtSessionKg ?? bodyweights?.get(entry.session.id) ?? null
}

function classifyPair(
  newer: ComparableSessionInput,
  older: ComparableSessionInput,
  bodyweights?: ReadonlyMap<string, number | null>,
): PairTrend {
  const wNew = completedWorkingSets(newer.sets)
  const wOld = completedWorkingSets(older.sets)
  if (wNew.length === 0 || wOld.length === 0) return 'reset'
  const kNew = sessionLoadKey(wNew)
  const kOld = sessionLoadKey(wOld)
  if (kNew != null && kOld != null) {
    // A session after a load increase never counts as declining (SPEC 14).
    if (kNew > kOld + EPS) return 'reset'
    if (kNew < kOld - EPS) {
      // Different loads: compare best-set e1RM, never raw total reps.
      const eNew = bestSessionE1rm(wNew, sessionBodyweight(newer, bodyweights))
      const eOld = bestSessionE1rm(wOld, sessionBodyweight(older, bodyweights))
      if (eNew == null || eOld == null) return 'reset'
      if (eNew < eOld - EPS) return 'decline'
      if (eNew > eOld + EPS) return 'improve'
      return 'stall'
    }
  }
  // Same load (or no numeric load dimension): compare total completed working reps.
  const rNew = totalReps(wNew)
  const rOld = totalReps(wOld)
  if (rNew < rOld) return 'decline'
  if (rNew > rOld) return 'improve'
  return 'stall'
}

/**
 * Stall detection over comparable history (newest first). Two consecutive
 * declining sessions -> mild fatigue notice; three consecutive stalled or
 * declining sessions -> deload options. One flat session is never a problem,
 * and any load increase resets both counters.
 */
export function detectStall(
  history: ComparableSessionInput[],
  bodyweights?: ReadonlyMap<string, number | null>,
): StallResult {
  let declineStreak = 0
  let stalledStreak = 0
  let declineBroken = false
  for (let i = 0; i + 1 < history.length; i++) {
    const newer = history[i]
    const older = history[i + 1]
    if (!newer || !older) break
    const trend = classifyPair(newer, older, bodyweights)
    if (trend === 'decline') {
      if (!declineBroken) declineStreak += 1
      stalledStreak += 1
    } else if (trend === 'stall') {
      declineBroken = true
      stalledStreak += 1
    } else {
      break
    }
  }
  if (stalledStreak >= 3) return { kind: 'deloadSuggestion', explanation: DELOAD_TEXT }
  if (declineStreak >= 2) return { kind: 'fatigueNotice', explanation: FATIGUE_TEXT }
  return { kind: 'none', explanation: '' }
}
