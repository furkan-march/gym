import { updateSet } from '../../../lib/data/workouts'
import type { Exercise, SetLog } from '../../../lib/types'
import { NumberField } from '../../components/NumberField'

/**
 * One set row (SPEC 11 SET-LOGGING CONTRACT): editable load and reps with
 * plus/minus steppers, optional RIR, side/warm-up badges, and a big one-tap
 * check. Completed rows stay editable in place; unchecking removes the set
 * from completed counts.
 */
export function SetRow({
  set,
  exercise,
  incrementKg,
  label,
  rirVisible,
  prevSetId,
  onComplete,
  onUncomplete,
  onMenu,
}: {
  set: SetLog
  exercise: Exercise
  incrementKg: number
  /** display label: working-set number or "W1" for warm-ups */
  label: string
  rirVisible: boolean
  prevSetId: string | null
  onComplete: (set: SetLog) => void
  onUncomplete: (set: SetLog) => void
  onMenu: (setId: string, prevSetId: string | null) => void
}) {
  const patch = (p: Partial<SetLog>) => void updateSet(set.id, p)
  const step = incrementKg > 0 ? incrementKg : 1

  const loadField = (() => {
    if (exercise.kind === 'repsOnly') return null
    if (exercise.kind === 'bodyweight' && set.bodyweightMode !== 'none') {
      switch (set.bodyweightMode) {
        case 'bodyweight':
          return (
            <div className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border bg-surface-2 text-[13px] text-text-muted">
              BW
            </div>
          )
        case 'added':
          return (
            <NumberField
              value={set.addedWeightKg}
              onChange={(v) => patch({ addedWeightKg: v })}
              step={step}
              suffix="+kg"
              label={`set ${label} added weight`}
              wide
            />
          )
        case 'assistedMachine':
          return (
            <NumberField
              value={set.assistanceWeightKg}
              onChange={(v) => patch({ assistanceWeightKg: v })}
              step={step}
              suffix="asst"
              label={`set ${label} assistance`}
              wide
            />
          )
        case 'assistedBand':
          return (
            <NumberField
              value={set.assistanceWeightKg}
              onChange={(v) => patch({ assistanceWeightKg: v })}
              step={step}
              suffix="band~"
              label={`set ${label} band assistance estimate`}
              wide
            />
          )
      }
    }
    return (
      <NumberField
        value={set.loadKg}
        onChange={(v) => patch({ loadKg: v })}
        step={step}
        suffix={set.loadConvention === 'perDumbbell' ? 'kg ea' : 'kg'}
        label={`set ${label} load`}
        wide
      />
    )
  })()

  const flags: string[] = []
  if (set.painFlag) flags.push('pain')
  if (set.formQuality === 'poor') flags.push('poor form')
  if (set.notes) flags.push('note')

  // SPEC 11 SET-LOGGING CONTRACT: load and reps are the required fields —
  // a set cannot be completed while they are missing.
  const missingRequired =
    !set.completed &&
    (set.reps == null ||
      (exercise.kind !== 'repsOnly' && set.bodyweightMode === 'none' && set.loadKg == null))

  return (
    <div
      className={`rounded-xl border p-2 ${
        set.completed ? 'border-accent/40 bg-accent/5' : 'border-border bg-surface'
      } ${set.isWarmup ? 'opacity-90' : ''}`}
    >
      <div className="flex items-center gap-1.5">
        <button
          aria-label={`Set ${label} options`}
          onClick={() => onMenu(set.id, prevSetId)}
          className="flex min-h-11 w-9 flex-none flex-col items-center justify-center rounded-lg active:bg-surface-2"
        >
          <span
            className={`tabular text-[14px] font-semibold ${set.isWarmup ? 'text-text-muted' : ''}`}
          >
            {label}
          </span>
          <span aria-hidden className="text-[11px] leading-none text-text-muted">
            ⋯
          </span>
        </button>
        {set.side != null && (
          <span
            className={`flex h-6 w-6 flex-none items-center justify-center rounded-md border text-[11px] font-semibold ${
              set.side === 'left'
                ? 'border-border bg-surface-2 text-text'
                : 'border-border bg-surface-2 text-text-muted'
            }`}
          >
            {set.side === 'left' ? 'L' : 'R'}
          </span>
        )}
        {loadField}
        <NumberField
          value={set.reps}
          onChange={(v) => patch({ reps: v == null ? null : Math.max(0, Math.round(v)) })}
          step={1}
          label={`set ${label} reps`}
          wide
        />
        <button
          aria-label={set.completed ? 'Uncheck set' : 'Complete set'}
          disabled={missingRequired}
          onClick={() => (set.completed ? onUncomplete(set) : onComplete(set))}
          className={`min-h-11 min-w-11 flex-none rounded-xl border text-[17px] transition-colors disabled:opacity-35 ${
            set.completed
              ? 'border-accent bg-accent font-bold text-black'
              : 'border-border bg-surface-2 text-text-muted'
          }`}
        >
          ✓
        </button>
      </div>
      {rirVisible && !set.isWarmup && (
        <div className="mt-1.5 flex items-center gap-1">
          <span className="w-7 flex-none text-[11px] text-text-muted">RIR</span>
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              aria-label={`Set ${label} RIR ${n}`}
              onClick={() => patch({ rir: set.rir === n ? null : n })}
              className={`tabular min-h-11 flex-1 rounded-lg border text-[13px] ${
                set.rir === n
                  ? 'border-accent bg-accent/15 font-semibold text-accent'
                  : 'border-border bg-surface-2 text-text-muted'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      )}
      {(flags.length > 0 || set.isWarmup) && (
        <div className="mt-1 flex gap-2 px-1 text-[11px]">
          {set.isWarmup && <span className="text-text-muted">warm-up</span>}
          {flags.map((f) => (
            <span key={f} className={f === 'note' ? 'text-text-muted' : 'text-warning'}>
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
