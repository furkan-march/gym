import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../../../lib/db'
import { addDaysKey, formatShort, weekStartKey } from '../../../lib/dates'
import { waistTrend } from '../../../lib/engines/bodyMetrics'
import {
  adjustmentSuggestion,
  buildWeeklyCheckIn,
  type AdjustmentSuggestion,
} from '../../../lib/engines/checkin'
import { nowIso } from '../../../lib/ids'
import type { AppSettings, DateKey, UserProfile, WeeklyCheckIn } from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { Rating } from '../../components/Segmented'
import { Button, Card } from '../../components/core'
import { adherence14, buildStallNotices, filterDemo } from './data'
import { fmtInt, fmtKg, fmtPct, fmtSignedPct } from './format'

/**
 * Weekly check-in (SPEC 24): offered for the previous Monday-Sunday week once
 * at least 7 days of program data exist; completable and editable for the
 * following 7 days. Aggregates are computed by the pure check-in engine; the
 * user only adds five 1-5 ratings and a note. Adjustment suggestions are text
 * only — targets are NEVER changed automatically.
 */

interface Ratings {
  hunger: number | null
  energy: number | null
  gymPerformance: number | null
  sleep: number | null
  stress: number | null
}

const EMPTY_RATINGS: Ratings = {
  hunger: null,
  energy: null,
  gymPerformance: null,
  sleep: null,
  stress: null,
}

function AggregateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[13px] text-text-muted">{label}</span>
      <span className="tabular text-[13px] font-medium">{value}</span>
    </div>
  )
}

export function CheckInSection({
  settings,
  profile,
  todayKey,
}: {
  settings: AppSettings
  profile: UserProfile
  todayKey: DateKey
}) {
  const navigate = useNavigate()
  const includeDemo = settings.demoDataEnabled === true
  const prevWeekStart = weekStartKey(addDaysKey(todayKey, -7), settings.weekStartsOn)
  const prevWeekEnd = addDaysKey(prevWeekStart, 6)

  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<'form' | 'result'>('form')
  const [ratings, setRatings] = useState<Ratings>(EMPTY_RATINGS)
  const [note, setNote] = useState('')
  const [suggestion, setSuggestion] = useState<AdjustmentSuggestion | null>(null)
  const [saveError, setSaveError] = useState(false)

  const data = useLiveQuery(async () => {
    const [
      metrics,
      sessions,
      exerciseSessions,
      sets,
      days,
      activities,
      cardio,
      postureLogs,
      postureTemplate,
      nutritionLogs,
      exercises,
      variants,
      existing,
    ] = await Promise.all([
      db.bodyMetrics.toArray(),
      db.workoutSessions.toArray(),
      db.exerciseSessions.toArray(),
      db.setLogs.toArray(),
      db.scheduledDays.toArray(),
      db.dailyActivities.toArray(),
      db.cardioSessions.toArray(),
      db.postureRoutineLogs.toArray(),
      db.postureRoutineTemplates.get('posture'),
      db.nutritionAdherenceLogs.toArray(),
      db.exercises.toArray(),
      db.exerciseVariants.toArray(),
      db.weeklyCheckIns.where('weekStartDateKey').equals(prevWeekStart).first(),
    ])
    return {
      metrics: filterDemo(metrics, includeDemo),
      sessions: filterDemo(sessions, includeDemo),
      exerciseSessions: filterDemo(exerciseSessions, includeDemo),
      sets: filterDemo(sets, includeDemo),
      days,
      activities: filterDemo(activities, includeDemo),
      cardio: filterDemo(cardio, includeDemo),
      postureLogs: filterDemo(postureLogs, includeDemo),
      postureTemplate: postureTemplate ?? null,
      nutritionLogs: filterDemo(nutritionLogs, includeDemo),
      exercises,
      variants,
      existing: existing ?? null,
    }
  }, [includeDemo, prevWeekStart])

  // SPEC 24: the check-in starts once at least 7 days of data can exist.
  const available = todayKey >= addDaysKey(profile.programStartDateKey, 7)
  if (!available || data === undefined) return null

  const built = buildWeeklyCheckIn(prevWeekStart, {
    metrics: data.metrics,
    sessions: data.sessions,
    exerciseSessions: data.exerciseSessions,
    sets: data.sets,
    days: data.days,
    activities: data.activities,
    cardio: data.cardio,
    postureLogs: data.postureLogs,
    postureTemplate: data.postureTemplate,
    nutritionLogs: data.nutritionLogs,
    programStart: profile.programStartDateKey,
    todayKey,
    now: nowIso(),
  })

  const existing = data.existing

  const openSheet = () => {
    setRatings(
      existing
        ? {
            hunger: existing.hunger,
            energy: existing.energy,
            gymPerformance: existing.gymPerformance,
            sleep: existing.sleep,
            stress: existing.stress,
          }
        : EMPTY_RATINGS,
    )
    setNote(existing?.note ?? '')
    setSuggestion(null)
    setSaveError(false)
    setPhase('form')
    setOpen(true)
  }

  const closeSheet = () => {
    setOpen(false)
    setPhase('form')
  }

  const save = async () => {
    const t = nowIso()
    const trimmed = note.trim()
    const row: WeeklyCheckIn = {
      ...built,
      ...ratings,
      note: trimmed.length > 0 ? trimmed : undefined,
      // Preserve the deterministic per-week id and original creation time.
      id: existing?.id ?? built.id,
      createdAt: existing?.createdAt ?? built.createdAt,
      updatedAt: t,
    }
    try {
      await db.weeklyCheckIns.put(row)
    } catch {
      // IndexedDB write failed (SPEC 33): keep the form so nothing is lost.
      setSaveError(true)
      return
    }
    const adherence = adherence14({
      todayKey,
      programStart: profile.programStartDateKey,
      days: data.days,
      sessions: data.sessions,
      exerciseSessions: data.exerciseSessions,
      sets: data.sets,
      nutritionLogs: data.nutritionLogs,
      activities: data.activities,
      metrics: data.metrics,
      cardio: data.cardio,
      postureLogs: data.postureLogs,
    })
    const stalls = buildStallNotices({
      exercises: data.exercises,
      variants: data.variants,
      sessions: data.sessions,
      exerciseSessions: data.exerciseSessions,
      sets: data.sets,
    })
    setSuggestion(
      adjustmentSuggestion({
        metrics: data.metrics,
        todayKey,
        adherencePct: adherence.pct,
        trackedDays14: adherence.trackedDays,
        // "Multiple compound lifts declining" = 2+ main lifts with a notice.
        strengthDeclining: stalls.length >= 2,
        waist: waistTrend(data.metrics, todayKey),
      }),
    )
    setPhase('result')
  }

  const weekLabel = `${formatShort(prevWeekStart)} – ${formatShort(prevWeekEnd)}`

  return (
    <>
      <Card className="mb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold">Weekly check-in</h3>
            <p className="mt-0.5 text-[12px] text-text-muted">
              {existing
                ? `Saved for ${weekLabel} · ${existing.strengthSessionsCompleted}/${existing.strengthSessionsScheduled} lifts${
                    existing.weightChangePct != null
                      ? ` · ${fmtSignedPct(existing.weightChangePct)}`
                      : ''
                  }`
                : `Review last week (${weekLabel})`}
            </p>
          </div>
          <Button
            variant={existing ? 'secondary' : 'primary'}
            className="shrink-0"
            onClick={openSheet}
          >
            {existing ? 'Edit' : 'Start check-in'}
          </Button>
        </div>
      </Card>

      <BottomSheet
        open={open}
        onClose={closeSheet}
        title={phase === 'form' ? `Check-in · ${weekLabel}` : 'Suggestion'}
      >
        {phase === 'form' ? (
          <div>
            <div className="divide-y divide-border rounded-xl border border-border bg-surface-2 px-3 py-1">
              <AggregateRow
                label="7-day avg weight"
                value={
                  built.currentAvgWeightKg != null ? `${built.currentAvgWeightKg.toFixed(1)} kg` : '—'
                }
              />
              <AggregateRow
                label="Previous week avg"
                value={
                  built.previousAvgWeightKg != null
                    ? `${built.previousAvgWeightKg.toFixed(1)} kg`
                    : '—'
                }
              />
              <AggregateRow
                label="Weight change"
                value={built.weightChangePct != null ? fmtSignedPct(built.weightChangePct) : '—'}
              />
              <AggregateRow
                label="Waist"
                value={built.waistCm != null ? `${fmtKg(built.waistCm)} cm` : '—'}
              />
              <AggregateRow
                label="Strength sessions"
                value={`${built.strengthSessionsCompleted}/${built.strengthSessionsScheduled}`}
              />
              <AggregateRow
                label="Average steps"
                value={built.avgSteps != null ? fmtInt(built.avgSteps) : '—'}
              />
              <AggregateRow label="Cardio" value={`${built.cardioMinutes} min`} />
              <AggregateRow
                label="Posture adherence"
                value={built.postureAdherencePct != null ? fmtPct(built.postureAdherencePct) : '—'}
              />
              <AggregateRow
                label="Calories on target"
                value={built.calorieAdherencePct != null ? fmtPct(built.calorieAdherencePct) : '—'}
              />
              <AggregateRow
                label="Protein reached"
                value={built.proteinAdherencePct != null ? fmtPct(built.proteinAdherencePct) : '—'}
              />
            </div>

            <div className="mt-4 flex flex-col gap-1">
              <Rating
                label="Hunger"
                value={ratings.hunger}
                onChange={(v) => setRatings((r) => ({ ...r, hunger: v }))}
              />
              <Rating
                label="Energy"
                value={ratings.energy}
                onChange={(v) => setRatings((r) => ({ ...r, energy: v }))}
              />
              <Rating
                label="Gym performance"
                value={ratings.gymPerformance}
                onChange={(v) => setRatings((r) => ({ ...r, gymPerformance: v }))}
              />
              <Rating
                label="Sleep"
                value={ratings.sleep}
                onChange={(v) => setRatings((r) => ({ ...r, sleep: v }))}
              />
              <Rating
                label="Stress"
                value={ratings.stress}
                onChange={(v) => setRatings((r) => ({ ...r, stress: v }))}
              />
            </div>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Optional note"
              className="mt-3 w-full rounded-xl border border-border bg-surface-2 p-3 text-[14px] placeholder:text-text-muted"
            />

            {saveError ? (
              <p className="mt-2 text-[13px] text-danger">
                Saving to on-device storage failed. Your entries are still on this form — try
                saving again.
              </p>
            ) : null}

            <Button variant="primary" className="mt-3 w-full" onClick={() => void save()}>
              Save check-in
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-[14px] leading-relaxed">{suggestion?.explanation}</p>
            {suggestion != null && suggestion.options.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-[13px] leading-relaxed text-text-muted">
                {suggestion.options.map((o) => (
                  <li key={o} className="py-0.5">
                    {o}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-3 text-[12px] text-text-muted">
              Nothing changes automatically — edit targets yourself if you want to apply an option.
            </p>
            <div className="mt-4 flex gap-2">
              {suggestion != null &&
              (suggestion.kind === 'plateauAdjust' || suggestion.kind === 'excessiveLoss') ? (
                <Button
                  className="flex-1"
                  onClick={() => {
                    closeSheet()
                    navigate('/plan')
                  }}
                >
                  Open Plan
                </Button>
              ) : null}
              <Button variant="primary" className="flex-1" onClick={closeSheet}>
                Done
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>
    </>
  )
}
