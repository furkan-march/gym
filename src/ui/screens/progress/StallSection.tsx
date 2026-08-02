import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { Card, SectionTitle } from '../../components/core'
import { buildStallNotices, filterDemo } from './data'

/**
 * Progression status (SPEC 14/19): fatigue notices and deload suggestions from
 * the progression engine for each main lift with at least 2 comparable
 * sessions. Neutral context, never guilt; the section disappears entirely when
 * everything is progressing.
 */
export function StallSection({ includeDemo }: { includeDemo: boolean }) {
  const notices = useLiveQuery(async () => {
    const [exercises, variants, sessions, exerciseSessions, sets] = await Promise.all([
      db.exercises.toArray(),
      db.exerciseVariants.toArray(),
      db.workoutSessions.toArray(),
      db.exerciseSessions.toArray(),
      db.setLogs.toArray(),
    ])
    return buildStallNotices({
      exercises,
      variants,
      sessions: filterDemo(sessions, includeDemo),
      exerciseSessions: filterDemo(exerciseSessions, includeDemo),
      sets: filterDemo(sets, includeDemo),
    })
  }, [includeDemo])

  if (notices === undefined || notices.length === 0) return null

  return (
    <>
      <SectionTitle>Progression status</SectionTitle>
      {notices.map((n) => (
        <Card key={`${n.exerciseId}|${n.variantId ?? ''}`} className="mt-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-semibold">
              {n.exerciseName}
              {n.variantName ? ` · ${n.variantName}` : ''}
            </h3>
            <span className="shrink-0 text-[11px] text-text-muted">
              {n.kind === 'deloadSuggestion' ? 'Deload suggestion' : 'Fatigue notice'}
            </span>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-text-muted">{n.explanation}</p>
        </Card>
      ))}
    </>
  )
}
