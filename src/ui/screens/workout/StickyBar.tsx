import { Button } from '../../components/core'
import { useNow } from '../../hooks/useNow'
import { elapsedActiveSeconds } from '../../../lib/engines/duration'
import type { WorkoutSession } from '../../../lib/types'
import { formatSeconds } from './helpers'

/**
 * Active-workout sticky bar (SPEC 11): elapsed active time, set progress,
 * current exercise, Finish. Estimated total gives quiet pace context (SPEC 18).
 */
export function StickyBar({
  session,
  estMinutes,
  completedSets,
  remainingSets,
  currentName,
  onCurrentTap,
  onFinish,
  onExit,
}: {
  session: WorkoutSession
  estMinutes: number | null
  completedSets: number
  remainingSets: number
  currentName: string | null
  onCurrentTap: () => void
  onFinish: () => void
  onExit: () => void
}) {
  const now = useNow(1000)
  const elapsed = elapsedActiveSeconds(session, now)
  return (
    <div className="pt-safe sticky top-0 z-30 -mx-4 border-b border-border bg-bg/95 px-4 backdrop-blur">
      <div className="flex items-center gap-2 py-2">
        <Button variant="ghost" className="px-2" onClick={onExit}>
          Exit
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <div className="tabular text-[17px] leading-tight font-semibold">
            {formatSeconds(elapsed)}
          </div>
          <div className="tabular text-[11px] text-text-muted">
            {completedSets} done · {remainingSets} left
            {estMinutes != null ? ` · ~${estMinutes} min planned` : ''}
          </div>
        </div>
        <Button variant="primary" className="px-3" onClick={onFinish}>
          Finish
        </Button>
      </div>
      <button
        onClick={onCurrentTap}
        className="flex min-h-11 w-full items-center justify-center gap-1 pb-1 text-[13px] text-accent"
      >
        <span className="truncate">{currentName ? `Now · ${currentName}` : 'All sets done'}</span>
      </button>
    </div>
  )
}
