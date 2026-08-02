import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { formatShort } from '../../../lib/dates'
import { EmptyState, Row } from '../../components/core'

/**
 * Posture-routine history (SPEC 26): one row per logged day. A day counts as
 * completed only when ALL items were done (SPEC 22).
 */
export function PostureTab({ includeDemo }: { includeDemo: boolean }) {
  const logs = useLiveQuery(
    async () =>
      (await db.postureRoutineLogs.orderBy('dateKey').reverse().toArray()).filter(
        (l) => includeDemo || l.isDemo !== true,
      ),
    [includeDemo],
  )

  if (logs === undefined) {
    return <p className="py-6 text-center text-[14px] text-text-muted">Loading posture history…</p>
  }

  if (logs.length === 0) {
    return (
      <EmptyState
        title="No posture sessions yet"
        body="Posture routine days appear here once you check items off from the Today tab."
      />
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface px-4">
      <div className="divide-y divide-border">
        {logs.map((log) => {
          const done = log.completedItemIds.length
          const complete = log.totalItems > 0 && done >= log.totalItems
          return (
            <Row
              key={log.id}
              left={<span className="text-[14px]">{formatShort(log.dateKey)}</span>}
              right={
                <span
                  className={`tabular text-[14px] ${complete ? 'text-accent' : 'text-text-muted'}`}
                >
                  {done}/{log.totalItems} {complete ? 'completed' : 'done'}
                </span>
              }
            />
          )
        })}
      </div>
    </div>
  )
}
