import { useEffect, useRef } from 'react'
import { db } from '../../../lib/db'
import { nowIso } from '../../../lib/ids'
import {
  addSeconds,
  pauseTimer,
  readTimer,
  resetTimer,
  resumeTimer,
  skipTimer,
  type RestTimerStatus,
} from '../../../lib/engines/restTimer'
import type { RestTimerState } from '../../../lib/types'
import { Button } from '../../components/core'
import { useNow } from '../../hooks/useNow'
import { formatSeconds, safeChime } from './helpers'

/**
 * Bottom rest-timer overlay (SPEC 12). All display state derives from the
 * persisted absolute timestamps via readTimer, so suspension never desyncs it;
 * an expiry that happened while suspended renders the distinct
 * "Rest finished N:SS ago" state. The chime fires exactly once per expiry.
 */
export function RestTimerBar({ timer }: { timer: RestTimerState }) {
  const now = useNow(250)
  const reading = readTimer(timer, now)
  const prevStatus = useRef<RestTimerStatus | null>(null)

  useEffect(() => {
    if (reading.status === 'expired' && prevStatus.current !== 'expired') safeChime()
    prevStatus.current = reading.status
  }, [reading.status])

  if (reading.status === 'idle') return null

  const persist = (s: RestTimerState) => {
    void db.restTimerState.put({ ...s, updatedAt: nowIso() })
  }

  if (reading.status === 'expired') {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-warning/40 bg-surface px-4 pt-2 pb-safe">
        <div className="flex items-center justify-between gap-3 pb-2">
          <div aria-live="polite" className="text-[15px] font-medium">
            Rest finished{' '}
            <span className="tabular">{formatSeconds(reading.expiredAgoSeconds ?? 0)}</span> ago
          </div>
          <Button variant="primary" className="px-3" onClick={() => persist(skipTimer(timer))}>
            Dismiss
          </Button>
        </div>
      </div>
    )
  }

  const paused = reading.status === 'paused'
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface px-4 pt-2 pb-safe">
      <div className="pb-2">
        <div className="flex items-baseline justify-between">
          <div aria-live="polite" className="tabular text-[26px] leading-tight font-semibold">
            {formatSeconds(reading.remainingSeconds)}
          </div>
          <span className={`text-[12px] ${paused ? 'text-warning' : 'text-text-muted'}`}>
            {paused ? 'Rest paused' : 'Rest'}
          </span>
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <Button
            aria-label="Subtract 30 seconds"
            className="flex-1 px-0"
            onClick={() => persist(addSeconds(timer, -30, new Date()))}
          >
            −30
          </Button>
          <Button
            aria-label="Add 30 seconds"
            className="flex-1 px-0"
            onClick={() => persist(addSeconds(timer, 30, new Date()))}
          >
            +30
          </Button>
          <Button
            aria-label={paused ? 'Resume rest timer' : 'Pause rest timer'}
            className="flex-1 px-0"
            onClick={() =>
              persist(paused ? resumeTimer(timer, new Date()) : pauseTimer(timer, new Date()))
            }
          >
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            aria-label="Reset rest timer"
            className="flex-1 px-0"
            onClick={() => persist(resetTimer(timer, new Date()))}
          >
            Reset
          </Button>
          <Button
            aria-label="Skip rest"
            variant="ghost"
            className="flex-1 px-0"
            onClick={() => persist(skipTimer(timer))}
          >
            Skip
          </Button>
        </div>
      </div>
    </div>
  )
}
