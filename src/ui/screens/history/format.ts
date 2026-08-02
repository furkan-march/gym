import { effectiveLoadKg } from '../../../lib/engines/effectiveLoad'
import type { CardioType, SetLog } from '../../../lib/types'

/**
 * History display formats (SPEC 13/26). Loads are kilograms; dumbbell loads
 * follow the loadConvention snapshotted on each set — stored history is never
 * reinterpreted.
 */

/** Trim float dust: up to 2 decimals, no trailing zeros. */
export function formatKg(v: number): string {
  const rounded = Math.round(v * 100) / 100
  return String(rounded)
}

/**
 * SPEC 13 load wording for one set:
 * "80 kg" / "30 kg each" / "BW" / "BW + 5 kg" / "25 kg assistance".
 */
export function formatSetLoad(
  set: Pick<
    SetLog,
    'bodyweightMode' | 'loadKg' | 'addedWeightKg' | 'assistanceWeightKg' | 'loadConvention'
  >,
): string {
  switch (set.bodyweightMode) {
    case 'bodyweight':
      return 'BW'
    case 'added':
      return set.addedWeightKg != null ? `BW + ${formatKg(set.addedWeightKg)} kg` : 'BW'
    case 'assistedMachine':
    case 'assistedBand':
      return set.assistanceWeightKg != null
        ? `${formatKg(set.assistanceWeightKg)} kg assistance`
        : 'assisted'
    case 'none':
      if (set.loadKg == null) return '—'
      return set.loadConvention === 'perDumbbell'
        ? `${formatKg(set.loadKg)} kg each`
        : `${formatKg(set.loadKg)} kg`
  }
}

/** Whole minutes from accumulated active seconds. */
export function formatDurationMin(activeSeconds: number): string {
  return `${Math.round(activeSeconds / 60)} min`
}

/** "6,420 kg" — grouped for legibility on large session volumes. */
export function formatVolumeKg(volume: number): string {
  return `${Math.round(volume).toLocaleString('en-US')} kg`
}

/**
 * Total valid volume of a session: completed working sets, load × reps, with
 * bodyweight modes valued via effective load and the session's bodyweight
 * snapshot. Sets without a numeric load are skipped, never guessed (SPEC 15).
 */
export function sessionVolumeKg(sets: SetLog[], bodyweightAtSessionKg: number | null): number {
  let volume = 0
  for (const set of sets) {
    if (!set.completed || set.isWarmup) continue
    if (set.reps == null || set.reps <= 0) continue
    const load = effectiveLoadKg(set, bodyweightAtSessionKg)
    if (load == null || load <= 0) continue
    volume += load * set.reps
  }
  return volume
}

export const CARDIO_TYPE_LABELS: Record<CardioType, string> = {
  outdoorWalk: 'Outdoor walk',
  inclineTreadmill: 'Incline treadmill',
  stationaryBike: 'Stationary bike',
  elliptical: 'Elliptical',
  rowing: 'Rowing',
  run: 'Run',
  other: 'Other cardio',
}

export function formatSignedPct(v: number): string {
  const rounded = Math.round(v * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`
}
