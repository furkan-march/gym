import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { formatShort, weekdayOfKey } from '../../../lib/dates'
import { weeklyStrengthAdherence } from '../../../lib/engines/adherence'
import { sevenDayAvg } from '../../../lib/engines/bodyMetrics'
import { weekDateKeys } from '../../../lib/engines/schedule'
import type { AppSettings, DateKey, UserProfile } from '../../../lib/types'
import { StatTile } from '../../components/core'
import { filterDemo } from './data'
import { fmtKg } from './format'

/**
 * Stat tiles (SPEC 19): lifting and posture adherence, body-fat estimate and
 * 7-day average weight are numbers, not charts. All percent-like values are
 * shown as completed/scheduled counts so a partial week never reads as failure.
 */
export function StatTiles({
  settings,
  profile,
  todayKey,
}: {
  settings: AppSettings
  profile: UserProfile
  todayKey: DateKey
}) {
  const includeDemo = settings.demoDataEnabled === true

  const data = useLiveQuery(async () => {
    const [days, sessions, exerciseSessions, sets, postureLogs, postureTemplate, metrics] =
      await Promise.all([
        db.scheduledDays.toArray(),
        db.workoutSessions.toArray(),
        db.exerciseSessions.toArray(),
        db.setLogs.toArray(),
        db.postureRoutineLogs.toArray(),
        db.postureRoutineTemplates.get('posture'),
        db.bodyMetrics.toArray(),
      ])
    return {
      days,
      sessions: filterDemo(sessions, includeDemo),
      exerciseSessions: filterDemo(exerciseSessions, includeDemo),
      sets: filterDemo(sets, includeDemo),
      postureLogs: filterDemo(postureLogs, includeDemo),
      postureTemplate: postureTemplate ?? null,
      metrics: filterDemo(metrics, includeDemo),
    }
  }, [includeDemo])

  if (data === undefined) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {['Lifting', 'Posture', 'Body fat', 'Weight'].map((label) => (
          <StatTile key={label} label={label} value="—" hint="Loading…" />
        ))}
      </div>
    )
  }

  // Lifting adherence for the current week (prorated by program start / today).
  const lifting = weeklyStrengthAdherence(
    todayKey,
    todayKey,
    profile.programStartDateKey,
    data.days,
    data.sessions,
    data.exerciseSessions,
    data.sets,
    settings.weekStartsOn,
  )

  // Posture: completed required days ÷ required days so far this week. A day
  // counts completed only when ALL items are done (SPEC 10).
  let postureRequired = 0
  let postureDone = 0
  if (data.postureTemplate) {
    for (const key of weekDateKeys(todayKey, settings.weekStartsOn)) {
      if (key < profile.programStartDateKey || key > todayKey) continue
      if (!data.postureTemplate.requiredDays.includes(weekdayOfKey(key))) continue
      postureRequired++
      const log = data.postureLogs.find((l) => l.dateKey === key)
      if (log && log.totalItems > 0 && log.completedItemIds.length >= log.totalItems) postureDone++
    }
  }

  // Latest body-fat estimate: newest logged value, else the profile estimate.
  const latestBf = [...data.metrics]
    .filter((m) => m.bodyFatPct != null)
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey))[0]
  const bfValue =
    latestBf?.bodyFatPct != null
      ? `${fmtKg(latestBf.bodyFatPct)}%`
      : profile.estimatedBodyFatPct != null
        ? `${fmtKg(profile.estimatedBodyFatPct)}%`
        : '—'
  const bfHint =
    latestBf != null
      ? `Estimate · ${formatShort(latestBf.dateKey)}`
      : profile.estimatedBodyFatPct != null
        ? 'Profile estimate'
        : 'Not logged yet'

  const avg = sevenDayAvg(data.metrics, todayKey)

  return (
    <div className="grid grid-cols-2 gap-2">
      <StatTile
        label="Lifting"
        value={lifting.scheduled === 0 ? '—' : `${lifting.completed}/${lifting.scheduled}`}
        hint={lifting.scheduled === 0 ? 'No sessions scheduled yet' : 'Sessions this week'}
      />
      <StatTile
        label="Posture"
        value={postureRequired === 0 ? '—' : `${postureDone}/${postureRequired}`}
        hint={postureRequired === 0 ? 'No required days yet' : 'Required days this week'}
      />
      <StatTile label="Body fat" value={bfValue} hint={bfHint} />
      <StatTile
        label="Weight"
        value={avg.avg != null ? `${avg.avg.toFixed(1)} kg` : '—'}
        hint={avg.avg != null ? '7-day average' : `Needs 3 weigh-ins in 7 days (${avg.count} so far)`}
      />
    </div>
  )
}
