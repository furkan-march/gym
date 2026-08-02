import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { weekStartKey } from '../../../lib/dates'
import { detectStall, type ComparableSessionInput } from '../../../lib/engines/progression'
import { suggestSecondZone2 } from '../../../lib/engines/zone2'
import { EX } from '../../../lib/seed/seed'
import type {
  DateKey,
  ExerciseSession,
  SetLog,
  WorkoutSession,
} from '../../../lib/types'
import { Button, Card } from '../../components/core'
import { useSettings } from '../../hooks/useSettings'
import { CardioSheet } from './CardioSheet'

/**
 * Optional second Zone 2 suggestion (SPEC 39, V2 item 6). Quiet card on rest/
 * recovery days, only when every recovery gate in suggestSecondZone2 holds.
 * Dismissal persists per week in localStorage; logging reuses CardioSheet
 * (which always saves isZone2 sessions).
 */

const DISMISSED_KEY = 'gym.zone2Dismissed'

/** Main compound lifts scanned for fatigue/deload notices (mirrors Progress). */
const MAIN_LIFT_IDS: string[] = [
  EX.benchPress,
  EX.squat,
  EX.romanianDeadlift,
  EX.overheadPress,
  EX.pullUp,
]

/**
 * Whether any main lift currently has a fatigue notice or deload suggestion.
 * NOTE: duplicates the minimal comparable-history grouping from
 * src/ui/screens/progress/data.ts buildStallNotices (grouped by strict
 * variantId equality, >= 2 completed sessions, newest first) — kept local so
 * this card has no dependency on the Progress screen.
 */
function hasFatigueOrDeloadNotice(
  sessions: WorkoutSession[],
  exerciseSessions: ExerciseSession[],
  sets: SetLog[],
): boolean {
  const sessionById = new Map<string, WorkoutSession>()
  for (const s of sessions) if (s.status === 'completed') sessionById.set(s.id, s)

  const setsByEs = new Map<string, SetLog[]>()
  for (const s of sets) {
    const list = setsByEs.get(s.exerciseSessionId)
    if (list) list.push(s)
    else setsByEs.set(s.exerciseSessionId, [s])
  }

  for (const liftId of MAIN_LIFT_IDS) {
    const groups = new Map<string, ComparableSessionInput[]>()
    for (const es of exerciseSessions) {
      if (es.exerciseId !== liftId) continue
      const session = sessionById.get(es.workoutSessionId)
      if (!session) continue
      const key = `v|${es.variantId ?? ''}`
      const entry: ComparableSessionInput = {
        session,
        exerciseSession: es,
        sets: setsByEs.get(es.id) ?? [],
        feedback: null,
      }
      const group = groups.get(key)
      if (group) group.push(entry)
      else groups.set(key, [entry])
    }
    for (const entries of groups.values()) {
      if (entries.length < 2) continue
      // Newest first, as detectStall expects.
      entries.sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt))
      if (detectStall(entries).kind !== 'none') return true
    }
  }
  return false
}

export function Zone2SuggestionCard({ todayKey }: { todayKey: DateKey }) {
  const settings = useSettings()
  const [cardioOpen, setCardioOpen] = useState(false)
  const [dismissedWeek, setDismissedWeek] = useState<string | null>(() =>
    localStorage.getItem(DISMISSED_KEY),
  )

  const data = useLiveQuery(async () => {
    const [scheduledDays, cardio, readiness, sessions, exerciseSessions, sets] = await Promise.all(
      [
        db.scheduledDays.toArray(),
        db.cardioSessions.toArray(),
        db.readinessLogs.toArray(),
        db.workoutSessions.toArray(),
        db.exerciseSessions.toArray(),
        db.setLogs.toArray(),
      ],
    )
    return {
      scheduledDays,
      cardio: cardio.filter((r) => !r.isDemo),
      readiness: readiness.filter((r) => !r.isDemo),
      sessions: sessions.filter((r) => !r.isDemo),
      exerciseSessions: exerciseSessions.filter((r) => !r.isDemo),
      sets: sets.filter((r) => !r.isDemo),
    }
  }, [])

  if (!settings || !data) return null

  const thisWeekStart = weekStartKey(todayKey, settings.weekStartsOn)
  if (dismissedWeek === thisWeekStart) return null

  const { suggest, reason } = suggestSecondZone2({
    todayKey,
    weekStartsOn: settings.weekStartsOn,
    scheduledDays: data.scheduledDays,
    cardio: data.cardio,
    readiness: data.readiness,
    hasActiveFatigueNotice: hasFatigueOrDeloadNotice(
      data.sessions,
      data.exerciseSessions,
      data.sets,
    ),
    weeklyZone2Target: settings.weeklyZone2Target,
  })
  if (!suggest) return null

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, thisWeekStart)
    setDismissedWeek(thisWeekStart)
  }

  return (
    <>
      <Card>
        <div className="text-[14px] font-medium">Optional second Zone 2</div>
        <p className="mt-1 text-[13px] leading-relaxed text-text-muted">{reason}</p>
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={() => setCardioOpen(true)}>
            Log Zone 2
          </Button>
          <Button variant="ghost" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      </Card>
      <CardioSheet
        open={cardioOpen}
        todayKey={todayKey}
        minutesMin={settings.zone2MinutesMin}
        minutesMax={settings.zone2MinutesMax}
        onClose={() => setCardioOpen(false)}
      />
    </>
  )
}
