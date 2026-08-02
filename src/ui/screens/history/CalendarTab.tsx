import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addMonths, endOfMonth, format, getDaysInMonth, startOfMonth } from 'date-fns'
import { db } from '../../../lib/db'
import { fromDateKey, toDateKey, weekdayOf } from '../../../lib/dates'
import type { DateKey, Weekday } from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { EmptyState, Row } from '../../components/core'
import { CARDIO_TYPE_LABELS, formatKg } from './format'

/**
 * History calendar (SPEC 39, V2 item 1): a month grid over existing History
 * data. Pure read-model — every record already carries a local dateKey, so the
 * calendar only groups by it (never by UTC). Dots per day: accent = completed
 * strength workout, warning = cardio session, muted = posture routine fully
 * completed; a thin underline marks days with a body metric. Tapping a day
 * opens a read-only summary sheet; detail lives in the other History tabs.
 */

interface DayEntries {
  workouts: { name: string; setsDone: number }[]
  cardio: { label: string; minutes: number }[]
  posture: { done: number; total: number } | null
  metric: { weightKg: number | null; waistCm: number | null } | null
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function isPostureComplete(p: { done: number; total: number } | null): boolean {
  return p !== null && p.total > 0 && p.done >= p.total
}

export function CalendarTab({
  includeDemo,
  weekStartsOn,
}: {
  includeDemo: boolean
  weekStartsOn: Weekday
}) {
  const [today] = useState(() => new Date())
  const todayKey = toDateKey(today)
  const [monthStart, setMonthStart] = useState(() => startOfMonth(today))
  const [openDayKey, setOpenDayKey] = useState<DateKey | null>(null)

  const monthFromKey = toDateKey(monthStart)
  const monthToKey = toDateKey(endOfMonth(monthStart))

  const data = useLiveQuery(async () => {
    const [sessions, cardio, posture, metrics] = await Promise.all([
      db.workoutSessions.where('dateKey').between(monthFromKey, monthToKey, true, true).toArray(),
      db.cardioSessions.where('dateKey').between(monthFromKey, monthToKey, true, true).toArray(),
      db.postureRoutineLogs
        .where('dateKey')
        .between(monthFromKey, monthToKey, true, true)
        .toArray(),
      db.bodyMetrics.where('dateKey').between(monthFromKey, monthToKey, true, true).toArray(),
    ])
    const completed = sessions.filter(
      (s) => s.status === 'completed' && (includeDemo || s.isDemo !== true),
    )
    const setsBySession = new Map<string, number>()
    if (completed.length > 0) {
      const sets = await db.setLogs
        .where('workoutSessionId')
        .anyOf(completed.map((s) => s.id))
        .toArray()
      for (const set of sets) {
        if (!set.completed || set.isWarmup) continue
        setsBySession.set(set.workoutSessionId, (setsBySession.get(set.workoutSessionId) ?? 0) + 1)
      }
    }
    return {
      completed,
      cardio: cardio.filter((c) => includeDemo || c.isDemo !== true),
      posture: posture.filter((p) => includeDemo || p.isDemo !== true),
      metrics: metrics.filter((m) => includeDemo || m.isDemo !== true),
      setsBySession,
    }
  }, [includeDemo, monthFromKey, monthToKey])

  const byDay = useMemo(() => {
    const map = new Map<DateKey, DayEntries>()
    if (!data) return map
    const day = (key: DateKey): DayEntries => {
      let d = map.get(key)
      if (!d) {
        d = { workouts: [], cardio: [], posture: null, metric: null }
        map.set(key, d)
      }
      return d
    }
    for (const s of data.completed) {
      day(s.dateKey).workouts.push({
        name: s.templateName,
        setsDone: data.setsBySession.get(s.id) ?? 0,
      })
    }
    for (const c of data.cardio) {
      day(c.dateKey).cardio.push({ label: CARDIO_TYPE_LABELS[c.type], minutes: c.minutes })
    }
    for (const p of data.posture) {
      day(p.dateKey).posture = { done: p.completedItemIds.length, total: p.totalItems }
    }
    for (const m of data.metrics) {
      day(m.dateKey).metric = { weightKg: m.weightKg, waistCm: m.waistCm }
    }
    return map
  }, [data])

  // Grid cells: leading blanks per weekStartsOn, then one key per day, padded
  // to complete weeks so the last row keeps seven columns.
  const cells: (DateKey | null)[] = []
  const leading = (weekdayOf(monthStart) - weekStartsOn + 7) % 7
  for (let i = 0; i < leading; i++) cells.push(null)
  const daysInMonth = getDaysInMonth(monthStart)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(toDateKey(new Date(monthStart.getFullYear(), monthStart.getMonth(), d)))
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const headers = Array.from({ length: 7 }, (_, i) => DAY_LABELS[(weekStartsOn + i) % 7] ?? '')

  const openEntries = openDayKey !== null ? (byDay.get(openDayKey) ?? null) : null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          aria-label="Previous month"
          onClick={() => setMonthStart((m) => startOfMonth(addMonths(m, -1)))}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[20px] text-text-muted active:text-text"
        >
          ‹
        </button>
        <span className="text-[15px] font-semibold">{format(monthStart, 'MMMM yyyy')}</span>
        <button
          aria-label="Next month"
          onClick={() => setMonthStart((m) => startOfMonth(addMonths(m, 1)))}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[20px] text-text-muted active:text-text"
        >
          ›
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-2">
        <div className="grid grid-cols-7 gap-1">
          {headers.map((h, i) => (
            <div key={`h-${i}`} className="pb-1 text-center text-[11px] text-text-muted">
              {h}
            </div>
          ))}
          {cells.map((key, i) => {
            if (key === null) return <div key={`blank-${i}`} />
            const entries = byDay.get(key)
            const isFuture = key > todayKey
            const isToday = key === todayKey
            return (
              <button
                key={key}
                disabled={isFuture}
                aria-label={format(fromDateKey(key), 'd MMMM yyyy')}
                onClick={() => setOpenDayKey(key)}
                className={`flex min-h-11 flex-col items-center rounded-lg border py-1 ${
                  isToday ? 'border-accent/50 bg-accent/10' : 'border-transparent'
                } ${isFuture ? 'opacity-40' : 'active:bg-surface-2'}`}
              >
                <span
                  className={`tabular text-[13px] leading-4 ${
                    isToday ? 'font-semibold text-accent' : ''
                  }`}
                >
                  {Number(key.slice(8))}
                </span>
                <span
                  className={`mt-0.5 h-0.5 w-3 rounded-full ${
                    entries?.metric ? 'bg-text-muted' : 'bg-transparent'
                  }`}
                />
                <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
                  {entries !== undefined && entries.workouts.length > 0 ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  ) : null}
                  {entries !== undefined && entries.cardio.length > 0 ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                  ) : null}
                  {entries !== undefined && isPostureComplete(entries.posture) ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-text-muted" />
                  ) : null}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-text-muted">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Workout
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          Cardio
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-text-muted" />
          Posture done
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 rounded-full bg-text-muted" />
          Weight logged
        </span>
      </div>

      {data !== undefined && byDay.size === 0 ? (
        <EmptyState
          title="Nothing logged this month"
          body="Workouts, cardio, posture days and body metrics show up as dots once they are logged."
        />
      ) : null}

      <BottomSheet
        open={openDayKey !== null}
        onClose={() => setOpenDayKey(null)}
        title={openDayKey !== null ? format(fromDateKey(openDayKey), 'EEEE d MMMM yyyy') : undefined}
      >
        {openEntries === null ? (
          <p className="pb-2 text-[14px] text-text-muted">Nothing logged on this day.</p>
        ) : (
          <div className="divide-y divide-border">
            {openEntries.workouts.map((w, i) => (
              <Row
                key={`w-${i}`}
                left={<span className="text-[14px] font-medium">{w.name}</span>}
                right={
                  <span className="tabular text-[14px] text-text-muted">
                    {w.setsDone} {w.setsDone === 1 ? 'set' : 'sets'}
                  </span>
                }
              />
            ))}
            {openEntries.cardio.map((c, i) => (
              <Row
                key={`c-${i}`}
                left={<span className="text-[14px]">{c.label}</span>}
                right={
                  <span className="tabular text-[14px] text-text-muted">{c.minutes} min</span>
                }
              />
            ))}
            {openEntries.posture !== null ? (
              <Row
                left={<span className="text-[14px]">Posture routine</span>}
                right={
                  <span
                    className={`tabular text-[14px] ${
                      isPostureComplete(openEntries.posture) ? 'text-accent' : 'text-text-muted'
                    }`}
                  >
                    {openEntries.posture.done}/{openEntries.posture.total}{' '}
                    {isPostureComplete(openEntries.posture) ? 'completed' : 'done'}
                  </span>
                }
              />
            ) : null}
            {openEntries.metric !== null ? (
              <Row
                left={<span className="text-[14px]">Body metrics</span>}
                right={
                  <span className="tabular text-[14px] text-text-muted">
                    {[
                      openEntries.metric.weightKg != null
                        ? `${formatKg(openEntries.metric.weightKg)} kg`
                        : null,
                      openEntries.metric.waistCm != null
                        ? `${formatKg(openEntries.metric.waistCm)} cm waist`
                        : null,
                    ]
                      .filter((x) => x !== null)
                      .join(' · ') || '—'}
                  </span>
                }
              />
            ) : null}
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
