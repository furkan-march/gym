import type { SetLog } from '../types'

/**
 * Effective load for a set (SPEC 15). Always uses the session's bodyweight
 * snapshot, never the live profile weight. Returns null when no meaningful
 * numeric load exists (e.g. band assistance without an estimated value, or
 * missing bodyweight snapshot).
 */
export function effectiveLoadKg(
  set: Pick<SetLog, 'bodyweightMode' | 'loadKg' | 'addedWeightKg' | 'assistanceWeightKg'>,
  bodyweightAtSessionKg: number | null,
): number | null {
  switch (set.bodyweightMode) {
    case 'none':
      return set.loadKg
    case 'bodyweight':
      return bodyweightAtSessionKg
    case 'added':
      if (bodyweightAtSessionKg == null) return null
      return bodyweightAtSessionKg + (set.addedWeightKg ?? 0)
    case 'assistedMachine':
      if (bodyweightAtSessionKg == null) return null
      return bodyweightAtSessionKg - (set.assistanceWeightKg ?? 0)
    case 'assistedBand':
      // No false precision: only a user-entered estimate produces a number.
      if (bodyweightAtSessionKg == null || set.assistanceWeightKg == null) return null
      return bodyweightAtSessionKg - set.assistanceWeightKg
  }
}
