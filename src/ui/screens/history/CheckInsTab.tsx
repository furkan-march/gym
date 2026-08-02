import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { formatShort } from '../../../lib/dates'
import { Card, EmptyState } from '../../components/core'
import { formatSignedPct } from './format'

/**
 * Weekly check-in history (SPEC 26): read-only summaries — check-ins are
 * created and edited on the Progress tab. weightChangePct is stored in
 * PERCENT units (−0.6 means −0.6%).
 */
export function CheckInsTab({ includeDemo }: { includeDemo: boolean }) {
  const checkIns = useLiveQuery(
    async () =>
      (await db.weeklyCheckIns.orderBy('weekStartDateKey').reverse().toArray()).filter(
        (c) => includeDemo || c.isDemo !== true,
      ),
    [includeDemo],
  )

  if (checkIns === undefined) {
    return <p className="py-6 text-center text-[14px] text-text-muted">Loading check-ins…</p>
  }

  if (checkIns.length === 0) {
    return (
      <EmptyState
        title="No weekly check-ins yet"
        body="Complete your Sunday check-in on the Progress tab and each week's summary appears here."
      />
    )
  }

  return (
    <div className="space-y-3">
      {checkIns.map((c) => (
        <Card key={c.id}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[15px] font-medium">Week of {formatShort(c.weekStartDateKey)}</span>
            {c.weightChangePct != null ? (
              <span
                className={`tabular text-[14px] font-semibold ${
                  c.weightChangePct <= 0 ? 'text-accent' : 'text-warning'
                }`}
              >
                {formatSignedPct(c.weightChangePct)}
              </span>
            ) : (
              <span className="text-[13px] text-text-muted">No weight data</span>
            )}
          </div>
          <div className="tabular mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-text-muted">
            <span>
              Workouts {c.strengthSessionsCompleted}/{c.strengthSessionsScheduled}
            </span>
            {c.currentAvgWeightKg != null ? <span>Avg {c.currentAvgWeightKg} kg</span> : null}
            {c.cardioMinutes > 0 ? <span>Cardio {c.cardioMinutes} min</span> : null}
            {c.avgSteps != null ? <span>{c.avgSteps.toLocaleString('en-US')} steps/day</span> : null}
          </div>
          {c.note ? <p className="mt-1 text-[13px] text-text-muted">{c.note}</p> : null}
        </Card>
      ))}
      <p className="px-1 text-[12px] text-text-muted">Check-ins are edited on the Progress tab.</p>
    </div>
  )
}
