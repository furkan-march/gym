import type { SetLog } from '../types'
import { effectiveLoadKg } from './effectiveLoad'

export const E1RM_MAX_REPS = 12

/** Epley formula (SPEC 20). Assumes inputs are already validated. */
export function epley(loadKg: number, reps: number): number {
  return loadKg * (1 + reps / 30)
}

/**
 * Estimated 1RM for a single set, or null when the set does not qualify:
 * incomplete, warm-up, more than 12 reps, or no meaningful load.
 * For dumbbell exercises the result follows the set's stored loadConvention
 * (per-dumbbell loads yield a per-dumbbell e1RM — label it as such in UI).
 */
export function setE1rm(set: SetLog, bodyweightAtSessionKg: number | null): number | null {
  if (!set.completed || set.isWarmup) return null
  if (set.reps == null || set.reps <= 0 || set.reps > E1RM_MAX_REPS) return null
  const load =
    set.bodyweightMode === 'none' ? set.loadKg : effectiveLoadKg(set, bodyweightAtSessionKg)
  if (load == null || load <= 0) return null
  return epley(load, set.reps)
}

/** Best valid e1RM across a session's sets for one exercise, or null. */
export function bestSessionE1rm(
  sets: SetLog[],
  bodyweightAtSessionKg: number | null,
): number | null {
  let best: number | null = null
  for (const s of sets) {
    const v = setE1rm(s, bodyweightAtSessionKg)
    if (v != null && (best == null || v > best)) best = v
  }
  return best
}
