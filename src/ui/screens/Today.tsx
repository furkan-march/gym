import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from '../../lib/db'
import { startWorkout } from '../../lib/data/workouts'
import { addDaysKey, formatShort, fromDateKey, toDateKey, weekStartKey } from '../../lib/dates'
import { newId, nowIso } from '../../lib/ids'
import {
  describePlan,
  findMissedWorkout,
  getPlanForDate,
  weekDateKeys,
} from '../../lib/engines/schedule'
import { weeklyStrengthAdherence } from '../../lib/engines/adherence'
import type { DateKey, ScheduledDay, WorkoutTemplate } from '../../lib/types'
import { Button, Card, Chip, EmptyState, SectionTitle } from '../components/core'
import { useNow } from '../hooks/useNow'
import { useProfile, useSettings } from '../hooks/useSettings'
import { CardioSheet } from './today/CardioSheet'
import { ChooseWorkoutSheet } from './today/ChooseWorkoutSheet'
import { MetricStrip } from './today/MetricStrip'
import { NutritionCard } from './today/NutritionCard'
import { PostureChecklist } from './today/PostureChecklist'
import { ReadinessSheet, type ReadinessValues } from './today/ReadinessSheet'
import { SupplementsCard } from './today/SupplementsCard'
import { Zone2SuggestionCard } from './today/Zone2SuggestionCard'
import { usePostureToday } from './today/usePostureToday'

/**
 * Today screen — the app's front door (SPEC 7). Renders in the SPEC 7 priority
 * order: title/date, primary action, secondary action, then summaries and the
 * compact metric strip. The resumable-workout banner is rendered globally by
 * App.tsx (ResumeBar), so this screen starts at the day title.
 *
 * Minor UI state lives in localStorage (allowed for dismissals/skips):
 * - gym.dismissedMissed: JSON DateKey[] of dismissed missed-workout dates
 * - gym.readinessSkipped: DateKey of the day readiness was skipped
 * - gym.checkinDismissed: week-start DateKey of the dismissed check-in card
 */

const DISMISSED_MISSED_KEY = 'gym.dismissedMissed'
const READINESS_SKIPPED_KEY = 'gym.readinessSkipped'
const CHECKIN_DISMISSED_KEY = 'gym.checkinDismissed'

function readDismissedMissed(): DateKey[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DISMISSED_MISSED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is DateKey => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** SPEC 7: the Lower template's day is titled "Legs". */
function templateDisplayName(template: WorkoutTemplate): string {
  return template.kind === 'lower' ? 'Legs' : template.name
}

const STORAGE_WRITE_ERROR = 'Could not save — the on-device storage write failed. Try again.'

export default function TodayScreen() {
  const navigate = useNavigate()
  const now = useNow(60_000)
  const todayKey = toDateKey(now)
  const settings = useSettings()
  const profile = useProfile()
  const posture = usePostureToday(todayKey)

  const [error, setError] = useState<string | null>(null)
  const [chooseOpen, setChooseOpen] = useState(false)
  const [cardioOpen, setCardioOpen] = useState(false)
  const [readinessCtx, setReadinessCtx] = useState<{
    template: WorkoutTemplate | null
    startAfter: boolean
  } | null>(null)
  const [dismissedMissed, setDismissedMissed] = useState<DateKey[]>(readDismissedMissed)
  const [checkinDismissedWeek, setCheckinDismissedWeek] = useState<string | null>(() =>
    localStorage.getItem(CHECKIN_DISMISSED_KEY),
  )

  const days = useLiveQuery(() => db.scheduledDays.toArray(), [])
  const templates = useLiveQuery(
    async () => (await db.workoutTemplates.orderBy('orderIndex').toArray()).filter((t) => !t.isDemo),
    [],
  )
  const sessions = useLiveQuery(
    async () => (await db.workoutSessions.toArray()).filter((s) => !s.isDemo),
    [],
  )
  const readinessToday = useLiveQuery(async () => {
    const rows = await db.readinessLogs.where('dateKey').equals(todayKey).toArray()
    return rows.find((r) => !r.isDemo) ?? null
  }, [todayKey])
  const cardioToday = useLiveQuery(
    async () =>
      (await db.cardioSessions.where('dateKey').equals(todayKey).toArray()).filter(
        (c) => !c.isDemo,
      ),
    [todayKey],
  )

  const lastWorkout = useLiveQuery(async () => {
    const completed = (await db.workoutSessions.where('status').equals('completed').toArray()).filter(
      (s) => !s.isDemo,
    )
    if (completed.length === 0) return null
    completed.sort(
      (a, b) => b.dateKey.localeCompare(a.dateKey) || b.startedAt.localeCompare(a.startedAt),
    )
    const latest = completed[0]
    if (!latest) return null
    const sets = await db.setLogs.where('workoutSessionId').equals(latest.id).toArray()
    return { session: latest, setCount: sets.filter((x) => x.completed && !x.isWarmup).length }
  }, [])

  const adherence = useLiveQuery(async () => {
    if (!settings || !profile) return undefined
    const weekKeys = weekDateKeys(todayKey, settings.weekStartsOn)
    const allDays = await db.scheduledDays.toArray()
    const weekSessions = (
      await db.workoutSessions.where('dateKey').anyOf(weekKeys).toArray()
    ).filter((s) => !s.isDemo)
    const ids = weekSessions.map((s) => s.id)
    const ess = ids.length
      ? await db.exerciseSessions.where('workoutSessionId').anyOf(ids).toArray()
      : []
    const sets = ids.length
      ? await db.setLogs.where('workoutSessionId').anyOf(ids).toArray()
      : []
    return weeklyStrengthAdherence(
      todayKey,
      todayKey,
      profile.programStartDateKey,
      allDays,
      weekSessions,
      ess,
      sets,
      settings.weekStartsOn,
    )
  }, [todayKey, settings?.weekStartsOn, profile?.programStartDateKey])

  /** Distinct days with any logged data since program start (SPEC 24 trigger). */
  const dataDayCount = useLiveQuery(async () => {
    const start = profile?.programStartDateKey
    if (!start) return undefined
    const dayKeys = new Set<DateKey>()
    const collect = (rows: { dateKey: DateKey; isDemo?: boolean }[]) => {
      for (const r of rows) if (!r.isDemo && r.dateKey >= start) dayKeys.add(r.dateKey)
    }
    collect(await db.workoutSessions.toArray())
    collect(await db.bodyMetrics.toArray())
    collect(await db.dailyActivities.toArray())
    collect(await db.nutritionAdherenceLogs.toArray())
    collect(await db.cardioSessions.toArray())
    collect(await db.postureRoutineLogs.toArray())
    collect(await db.readinessLogs.toArray())
    return dayKeys.size
  }, [profile?.programStartDateKey])

  // -------------------------------------------------------------------------
  // Loading / empty states
  // -------------------------------------------------------------------------
  if (
    !settings ||
    !profile ||
    !days ||
    !templates ||
    !sessions ||
    readinessToday === undefined ||
    cardioToday === undefined
  ) {
    return <div className="py-16 text-center text-[13px] text-text-muted">Loading…</div>
  }

  if (days.length === 0) {
    return (
      <div className="pt-6">
        <EmptyState
          title="No weekly schedule configured"
          body="Reopen the app to restore the default plan, or set one up in Plan."
        />
      </div>
    )
  }

  let plan: ScheduledDay | null = null
  try {
    plan = getPlanForDate(now, days)
  } catch {
    plan = null
  }
  if (!plan) {
    return (
      <div className="pt-6">
        <EmptyState
          title="Today has no scheduled plan"
          body="The weekly schedule is missing this weekday. Reopen the app to restore defaults."
        />
      </div>
    )
  }

  const desc = describePlan(plan, templates)
  const todayTemplate =
    plan.planKind === 'strength' && plan.templateId != null
      ? (templates.find((t) => t.id === plan.templateId) ?? null)
      : null
  const title = todayTemplate ? templateDisplayName(todayTemplate) : desc.title

  // -------------------------------------------------------------------------
  // Start flow (SPEC 17: readiness sheet on lifting days, never blocking)
  // -------------------------------------------------------------------------
  const doStart = async (template: WorkoutTemplate) => {
    try {
      await startWorkout(template)
      navigate('/workout')
    } catch {
      setError(
        'Could not start the workout — the on-device storage write failed. Check free space and try again.',
      )
    }
  }

  const handleStartTemplate = (template: WorkoutTemplate) => {
    const skippedToday = localStorage.getItem(READINESS_SKIPPED_KEY) === todayKey
    if (skippedToday || readinessToday) void doStart(template)
    else setReadinessCtx({ template, startAfter: true })
  }

  const handleReadinessSave = async (values: ReadinessValues) => {
    const ctx = readinessCtx
    setReadinessCtx(null)
    try {
      if (readinessToday) {
        await db.readinessLogs.update(readinessToday.id, { ...values })
      } else {
        await db.readinessLogs.add({
          id: newId(),
          dateKey: todayKey,
          workoutSessionId: null,
          ...values,
          createdAt: nowIso(),
        })
      }
    } catch {
      setError('Could not save readiness — the on-device storage write failed.')
    }
    // Readiness never blocks starting the workout (SPEC 17).
    if (ctx?.startAfter && ctx.template) await doStart(ctx.template)
  }

  const handleReadinessSkip = () => {
    const ctx = readinessCtx
    setReadinessCtx(null)
    if (ctx?.startAfter) {
      localStorage.setItem(READINESS_SKIPPED_KEY, todayKey)
      if (ctx.template) void doStart(ctx.template)
    }
  }

  // -------------------------------------------------------------------------
  // Missed workout (SPEC 5), weekly check-in (SPEC 24), first run (SPEC 7)
  // -------------------------------------------------------------------------
  const missed = findMissedWorkout(
    todayKey,
    days,
    sessions,
    profile.programStartDateKey,
    dismissedMissed,
  )
  const missedTemplate = missed
    ? (templates.find((t) => t.id === missed.templateId) ?? null)
    : null

  const dismissMissed = (dateKey: DateKey) => {
    const next = [...dismissedMissed.filter((k) => k >= addDaysKey(todayKey, -30)), dateKey]
    localStorage.setItem(DISMISSED_MISSED_KEY, JSON.stringify(next))
    setDismissedMissed(next)
  }

  const thisWeekStart = weekStartKey(todayKey, settings.weekStartsOn)
  const showCheckin = (dataDayCount ?? 0) >= 7 && checkinDismissedWeek !== thisWeekStart
  const dismissCheckin = () => {
    localStorage.setItem(CHECKIN_DISMISSED_KEY, thisWeekStart)
    setCheckinDismissedWeek(thisWeekStart)
  }

  const hasCompletedWorkout = sessions.some((s) => s.status === 'completed')
  const loggedCardioMinutes = cardioToday.reduce((sum, c) => sum + c.minutes, 0)

  return (
    <div className="flex flex-col gap-3 pt-4">
      {/* 1. Day title + date */}
      <header>
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="mt-0.5 text-[13px] text-text-muted">{format(now, 'EEEE d MMMM')}</div>
      </header>

      {error ? (
        <Card className="border-danger/40">
          <div className="text-[13px] text-danger">{error}</div>
        </Card>
      ) : null}

      {/* 2. Primary action / day-specific main content */}
      {plan.planKind === 'strength' ? (
        todayTemplate ? (
          <div>
            <Button
              variant="primary"
              className="min-h-12 w-full text-[17px]"
              onClick={() => handleStartTemplate(todayTemplate)}
            >
              {desc.primaryAction ?? `Start ${todayTemplate.name}`}
            </Button>
            <div className="mt-2 flex">
              <Chip
                active={readinessToday != null}
                onClick={() => setReadinessCtx({ template: todayTemplate, startAfter: false })}
              >
                {readinessToday != null ? 'Readiness logged' : 'Readiness'}
              </Chip>
            </div>
          </div>
        ) : (
          <Card>
            <div className="text-[14px] text-text-muted">
              No template is assigned to today's strength slot. Pick a workout below, or fix the
              schedule in Plan.
            </div>
          </Card>
        )
      ) : null}

      {plan.planKind === 'zone2' ? (
        <Card>
          <div className="text-[15px] font-medium">Zone 2 cardio</div>
          <div className="mt-0.5 text-[13px] text-text-muted">
            {plan.cardioMinutesMin ?? 30}–{plan.cardioMinutesMax ?? 40} min target · easy,
            conversational pace
          </div>
          {loggedCardioMinutes > 0 ? (
            <div className="tabular mt-2 text-[14px]">Logged today: {loggedCardioMinutes} min</div>
          ) : null}
          <Button variant="primary" className="mt-3 w-full" onClick={() => setCardioOpen(true)}>
            Log cardio
          </Button>
        </Card>
      ) : null}

      {plan.planKind === 'recovery' || plan.planKind === 'rest' ? (
        posture.loading ? (
          <div className="h-40 rounded-2xl border border-border bg-surface" aria-hidden />
        ) : (
          <Card>
            <div className="flex items-baseline justify-between">
              <div className="text-[15px] font-medium">Posture routine</div>
              <div
                className={`tabular text-[13px] ${posture.allDone ? 'text-accent' : 'text-text-muted'}`}
              >
                {posture.allDone
                  ? 'Done'
                  : `${posture.completedIds.length}/${posture.items.length}`}
              </div>
            </div>
            <div className="mt-0.5 text-[12px] text-text-muted">
              {posture.required ? 'Scheduled today' : 'Optional today'} · completed when all items
              are checked
            </div>
            <div className="mt-2">
              <PostureChecklist
                items={posture.items}
                completedIds={posture.completedIds}
                onToggle={(id) => void posture.toggle(id).catch(() => setError(STORAGE_WRITE_ERROR))}
              />
            </div>
          </Card>
        )
      ) : null}

      {/* 3. Secondary action */}
      <Button className="w-full" onClick={() => setChooseOpen(true)}>
        Choose another workout
      </Button>

      {/* 4. Missed-workout option (neutral, SPEC 5/7) */}
      {missed && missedTemplate ? (
        <Card className="border-warning/40">
          <div className="text-[14px]">
            {format(fromDateKey(missed.dateKey), 'EEEE')}'s {templateDisplayName(missedTemplate)}{' '}
            workout wasn't logged
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => handleStartTemplate(missedTemplate)}
            >
              Do it today
            </Button>
            <Button onClick={() => dismissMissed(missed.dateKey)}>Dismiss</Button>
          </div>
        </Card>
      ) : null}

      {/* Weekly check-in offer (SPEC 24: surfaces near the top, below the primary action) */}
      {showCheckin ? (
        <Card className="border-accent/40">
          <div className="text-[15px] font-medium">Weekly check-in ready</div>
          <div className="mt-0.5 text-[13px] text-text-muted">
            Review last week's weight, training, steps, and nutrition.
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" className="flex-1" onClick={() => navigate('/progress')}>
              Open check-in
            </Button>
            <Button onClick={dismissCheckin}>Dismiss</Button>
          </div>
        </Card>
      ) : null}

      {/* 5. Last completed workout, one line */}
      {lastWorkout ? (
        <div className="px-1 text-[13px] text-text-muted">
          Last workout: {lastWorkout.session.templateName} ·{' '}
          {formatShort(lastWorkout.session.dateKey)} ·{' '}
          <span className="tabular">{lastWorkout.setCount}</span> completed sets
        </div>
      ) : null}

      {/* 9. First-run explainer (SPEC 7 FIRST-RUN EXPERIENCE) */}
      {!hasCompletedWorkout ? (
        <Card>
          <div className="text-[15px] font-medium">Starting fresh</div>
          <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
            Workouts start empty — set your starting weights during the first week. Your late-2025
            benchmarks appear as reference hints in the workout screen while you dial things in.
          </p>
        </Card>
      ) : null}

      {/* 6. Compact metric strip */}
      <MetricStrip todayKey={todayKey} stepsOptional={plan.stepsOptional} />

      {/* V2 below-the-fold cards: optional second Zone 2 + supplement checklist */}
      <Zone2SuggestionCard todayKey={todayKey} />
      <SupplementsCard todayKey={todayKey} />

      {/* 7. Weekly strength adherence + nutrition quick log */}
      <SectionTitle>This week</SectionTitle>
      <Card>
        {adherence ? (
          adherence.scheduled === 0 ? (
            <div className="text-[13px] text-text-muted">
              No strength sessions scheduled yet this week.
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-[14px]">Strength sessions</span>
              <span className="tabular text-[15px] font-semibold">
                {adherence.completed}/{adherence.scheduled}
                {adherence.pct != null ? (
                  <span className="ml-1 text-[13px] font-normal text-text-muted">
                    · {Math.round(adherence.pct * 100)}%
                  </span>
                ) : null}
              </span>
            </div>
          )
        ) : (
          <div className="text-[13px] text-text-muted">Calculating…</div>
        )}
      </Card>
      <NutritionCard todayKey={todayKey} />

      {/* Sheets */}
      <ReadinessSheet
        open={readinessCtx != null}
        showKnee={readinessCtx?.template?.kind === 'lower'}
        existing={readinessToday}
        willStart={readinessCtx?.startAfter ?? false}
        onSave={(v) => void handleReadinessSave(v)}
        onSkip={handleReadinessSkip}
        onClose={() => setReadinessCtx(null)}
      />
      <ChooseWorkoutSheet
        open={chooseOpen}
        templates={templates}
        onPick={(t) => {
          setChooseOpen(false)
          handleStartTemplate(t)
        }}
        onClose={() => setChooseOpen(false)}
      />
      <CardioSheet
        open={cardioOpen}
        todayKey={todayKey}
        minutesMin={plan.cardioMinutesMin}
        minutesMax={plan.cardioMinutesMax}
        onClose={() => setCardioOpen(false)}
      />
    </div>
  )
}
