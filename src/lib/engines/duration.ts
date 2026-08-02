import type { Exercise, TemplateExercise, WorkoutSession } from '../types'

/**
 * Session-duration estimation (SPEC 18) and elapsed active time.
 *
 * Formula: warm-up estimate
 *          + per block (set time + (rounds - 1) x rest)
 *          + 90 s transition per block.
 *
 * - Per-side (unilateral) prescriptions count each side's set individually for
 *   set time, but rest applies per ROUND (left + right back-to-back, SPEC 8),
 *   so the rest count stays prescribedSets - 1.
 * - Exercises sharing a supersetGroup form ONE combined block: summed set
 *   times, a single rest chain, and a single transition.
 * - Ramp-up sets (when enabled) add 40 s of set time plus a short 60 s rest
 *   each, per SPEC 8/18 ("must be included in the estimated session duration").
 */

export const WORKING_SET_SECONDS = 40
export const TRANSITION_SECONDS = 90
export const RAMP_SET_SECONDS = 40
export const RAMP_REST_SECONDS = 60

export type EstimatorExercise = TemplateExercise & { exercise: Exercise }

export interface DurationInput {
  templateExercises: EstimatorExercise[]
  warmupMinutes: number
  rampSetsEnabled: boolean
}

/** Set time for one template exercise, counting per-side sets individually. */
function setTimeSeconds(tex: EstimatorExercise, rampSetsEnabled: boolean): number {
  const perSideFactor = tex.exercise.unilateral ? 2 : 1
  const working = tex.prescribedSets * perSideFactor * WORKING_SET_SECONDS
  const ramp = rampSetsEnabled ? tex.rampScheme.length * (RAMP_SET_SECONDS + RAMP_REST_SECONDS) : 0
  return working + ramp
}

/** Estimated total session duration in whole minutes. */
export function estimateSessionMinutes(input: DurationInput): number {
  const ordered = [...input.templateExercises].sort((a, b) => a.orderIndex - b.orderIndex)

  // Group superset members into single blocks, preserving first-seen order.
  const blocks: EstimatorExercise[][] = []
  const blockIndexByGroup = new Map<string, number>()
  for (const tex of ordered) {
    const group = tex.supersetGroup
    const existing = group != null ? blockIndexByGroup.get(group) : undefined
    if (existing != null) {
      blocks[existing]?.push(tex)
    } else {
      if (group != null) blockIndexByGroup.set(group, blocks.length)
      blocks.push([tex])
    }
  }

  let totalSeconds = Math.max(0, input.warmupMinutes) * 60
  for (const block of blocks) {
    let setSeconds = 0
    let rounds = 0
    let restSeconds = 0
    for (const tex of block) {
      setSeconds += setTimeSeconds(tex, input.rampSetsEnabled)
      // One superset round = one set of each member; the longest member and
      // the longest configured rest bound the block's rest chain.
      rounds = Math.max(rounds, tex.prescribedSets)
      restSeconds = Math.max(restSeconds, tex.restSeconds)
    }
    totalSeconds += setSeconds + Math.max(0, rounds - 1) * restSeconds + TRANSITION_SECONDS
  }
  return Math.round(totalSeconds / 60)
}

/**
 * Elapsed ACTIVE seconds of a workout session: the frozen accumulator plus the
 * live span since the last activation while the session is active. Pure —
 * `now` is injected, so suspension/refresh recovery stays testable.
 */
export function elapsedActiveSeconds(session: WorkoutSession, now: Date): number {
  let total = session.activeSeconds
  if (session.status === 'active' && session.lastActivatedAt != null) {
    total += Math.max(0, (now.getTime() - Date.parse(session.lastActivatedAt)) / 1000)
  }
  return Math.floor(total)
}
