import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { formatShort } from '../../../lib/dates'
import type {
  JointDiscomfort,
  PersonalRecord,
  SessionFeedback,
  SetLog,
  WorkoutSession,
} from '../../../lib/types'
import { Card, Chip, EmptyState } from '../../components/core'
import { SessionDetailSheet } from './SessionDetailSheet'
import { formatDurationMin, formatVolumeKg, sessionVolumeKg } from './format'

/**
 * Completed-workout history (SPEC 26): newest-first cards with search over
 * exercise names and template filter chips. Tap a card for the detail sheet.
 */

interface SessionCard {
  session: WorkoutSession
  exercisesCompleted: number
  workingSetsCompleted: number
  volumeKg: number
  exerciseNames: string[]
  feedback: SessionFeedback | null
  prCount: number
}

const DISCOMFORT_CLASS: Record<JointDiscomfort, string> = {
  none: 'text-text-muted',
  mild: 'text-text-muted',
  moderate: 'text-warning',
  severe: 'text-danger',
}

export function WorkoutsTab({ includeDemo }: { includeDemo: boolean }) {
  const [query, setQuery] = useState('')
  const [templateFilter, setTemplateFilter] = useState<string | null>(null)
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)

  const data = useLiveQuery(async () => {
    const sessions = (await db.workoutSessions.where('status').equals('completed').toArray())
      .filter((s) => includeDemo || s.isDemo !== true)
      .sort((a, b) => {
        if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? 1 : -1
        return a.startedAt < b.startedAt ? 1 : -1
      })
    const [ess, sets, feedbacks, records] = await Promise.all([
      db.exerciseSessions.toArray(),
      db.setLogs.toArray(),
      db.sessionFeedbacks.toArray(),
      db.personalRecords.toArray(),
    ])
    return { sessions, ess, sets, feedbacks, records }
  }, [includeDemo])

  const cards = useMemo<SessionCard[] | null>(() => {
    if (!data) return null
    const essBySession = new Map<string, { name: string; status: string }[]>()
    for (const es of data.ess) {
      const list = essBySession.get(es.workoutSessionId) ?? []
      list.push({ name: es.exerciseName, status: es.status })
      essBySession.set(es.workoutSessionId, list)
    }
    const setsBySession = new Map<string, SetLog[]>()
    for (const set of data.sets) {
      const list = setsBySession.get(set.workoutSessionId) ?? []
      list.push(set)
      setsBySession.set(set.workoutSessionId, list)
    }
    const feedbackBySession = new Map<string, SessionFeedback>()
    for (const f of data.feedbacks) feedbackBySession.set(f.workoutSessionId, f)
    const prsBySession = new Map<string, PersonalRecord[]>()
    for (const r of data.records) {
      if (!includeDemo && r.isDemo === true) continue
      const list = prsBySession.get(r.workoutSessionId) ?? []
      list.push(r)
      prsBySession.set(r.workoutSessionId, list)
    }

    return data.sessions.map((session) => {
      const ess = essBySession.get(session.id) ?? []
      const sets = setsBySession.get(session.id) ?? []
      return {
        session,
        exercisesCompleted: ess.filter((e) => e.status === 'completed').length,
        workingSetsCompleted: sets.filter((s) => s.completed && !s.isWarmup).length,
        volumeKg: sessionVolumeKg(sets, session.bodyweightAtSessionKg),
        exerciseNames: ess.map((e) => e.name),
        feedback: feedbackBySession.get(session.id) ?? null,
        prCount: (prsBySession.get(session.id) ?? []).length,
      }
    })
  }, [data, includeDemo])

  if (cards === null) {
    return <p className="py-6 text-center text-[14px] text-text-muted">Loading history…</p>
  }

  if (cards.length === 0) {
    return (
      <EmptyState
        title="No workouts yet"
        body="Completed workouts appear here with sets, volume and feedback. Start your first one from the Today tab."
      />
    )
  }

  const templateNames = [...new Set(cards.map((c) => c.session.templateName))].sort((a, b) =>
    a.localeCompare(b),
  )

  const q = query.trim().toLowerCase()
  const filtered = cards.filter((c) => {
    if (templateFilter !== null && c.session.templateName !== templateFilter) return false
    if (q === '') return true
    return c.exerciseNames.some((n) => n.toLowerCase().includes(q))
  })

  return (
    <div className="space-y-3">
      <input
        type="search"
        inputMode="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by exercise name"
        aria-label="Search workouts by exercise name"
        className="min-h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-[15px] outline-none placeholder:text-text-muted"
      />
      {templateNames.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip active={templateFilter === null} onClick={() => setTemplateFilter(null)}>
            All
          </Chip>
          {templateNames.map((name) => (
            <Chip
              key={name}
              active={templateFilter === name}
              onClick={() => setTemplateFilter(templateFilter === name ? null : name)}
            >
              {name}
            </Chip>
          ))}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching workouts"
          body="No completed workout contains that exercise with the current filter. Try a different search or template."
        />
      ) : (
        filtered.map((c) => (
          <button
            key={c.session.id}
            onClick={() => setOpenSessionId(c.session.id)}
            className="block w-full text-left"
          >
            <Card>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[16px] font-semibold">{c.session.templateName}</span>
                <span className="tabular shrink-0 text-[13px] text-text-muted">
                  {formatShort(c.session.dateKey)}
                </span>
              </div>
              <div className="tabular mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-text-muted">
                <span>{formatDurationMin(c.session.activeSeconds)}</span>
                <span>{c.exercisesCompleted} exercises</span>
                <span>{c.workingSetsCompleted} sets</span>
                <span className="text-text">{formatVolumeKg(c.volumeKg)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
                {c.prCount > 0 ? (
                  <span className="tabular font-medium text-accent">
                    {c.prCount} PR{c.prCount > 1 ? 's' : ''}
                  </span>
                ) : null}
                {c.feedback?.difficulty != null ? (
                  <span className="tabular text-text-muted">
                    Difficulty {c.feedback.difficulty}/5
                  </span>
                ) : null}
                {c.feedback?.jointDiscomfort && c.feedback.jointDiscomfort !== 'none' ? (
                  <span className={DISCOMFORT_CLASS[c.feedback.jointDiscomfort]}>
                    Joints: {c.feedback.jointDiscomfort}
                  </span>
                ) : null}
                {c.session.notes ? <span className="text-text-muted">Note</span> : null}
              </div>
            </Card>
          </button>
        ))
      )}

      <SessionDetailSheet sessionId={openSessionId} onClose={() => setOpenSessionId(null)} />
    </div>
  )
}
