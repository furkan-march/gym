import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { db } from '../../../lib/db'
import { addDaysKey, formatShort, weekStartKey, weekdayOfKey } from '../../../lib/dates'
import { weeklyStrengthAdherence } from '../../../lib/engines/adherence'
import { weekDateKeys } from '../../../lib/engines/schedule'
import type { DateKey, Weekday } from '../../../lib/types'
import { EmptyState } from '../../components/core'
import {
  AXIS_TICK,
  CHART,
  CHART_HEIGHT,
  CHART_MARGIN,
  ChartCard,
  ChartLoading,
  TOOLTIP_CONTENT_STYLE,
  TOOLTIP_LABEL_STYLE,
} from './chartTheme'
import { filterDemo } from './data'
import { fmtPct } from './format'

/**
 * Weekly adherence charts (SPEC 39 item 5): lifting and posture consistency
 * over the last 8 fully completed weeks. The V1 stat tiles keep showing the
 * current (partial) week; these charts only ever show finished weeks so a
 * half-done week never reads as a dip.
 */

/** Completed weeks shown in each adherence chart. */
const ADHERENCE_WEEKS = 8

interface WeekAdherence {
  week: DateKey
  done: number
  total: number
  /** 0..100 percent, capped at 100; null when the week had nothing scheduled */
  pct: number | null
}

/** Week-start keys of the last ADHERENCE_WEEKS fully completed weeks, oldest first. */
function completedWeekStarts(todayKey: DateKey, weekStartsOn: Weekday): DateKey[] {
  const currentStart = weekStartKey(todayKey, weekStartsOn)
  const out: DateKey[] = []
  for (let back = ADHERENCE_WEEKS; back >= 1; back--) {
    out.push(addDaysKey(currentStart, -7 * back))
  }
  return out
}

interface AdherenceChartProps {
  includeDemo: boolean
  weekStartsOn: Weekday
  programStart: DateKey
  todayKey: DateKey
}

/** Shared bar plot: y is always 0–100%, one bar per completed week. */
function AdherenceBars({ weeks, tooltipName }: { weeks: WeekAdherence[]; tooltipName: string }) {
  return (
    <div style={{ height: CHART_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={weeks} margin={CHART_MARGIN}>
          <CartesianGrid stroke={CHART.grid} vertical={false} strokeOpacity={0.6} />
          <XAxis
            dataKey="week"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: CHART.grid }}
            tickFormatter={(v: string) => formatShort(v)}
            interval="preserveStartEnd"
            minTickGap={30}
          />
          <YAxis
            width={34}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v: number) => String(v)}
          />
          <Tooltip
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            labelFormatter={(label) => `Week of ${formatShort(String(label))}`}
            formatter={(value, _name, item) => {
              const p = item.payload as WeekAdherence
              return [`${p.done}/${p.total} · ${fmtPct(Number(value))}`, tooltipName]
            }}
          />
          <Bar
            dataKey="pct"
            fill={CHART.accent}
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Weekly lifting adherence: completed ÷ scheduled strength sessions per
 * completed week via weeklyStrengthAdherence (SPEC 24 rules — its pct is a
 * 0–1 ratio, converted to percent exactly once here). Weeks that ended before
 * the program started are skipped entirely; the week containing programStart
 * is prorated by the engine.
 */
export function LiftingAdherenceChart({
  includeDemo,
  weekStartsOn,
  programStart,
  todayKey,
}: AdherenceChartProps) {
  const weeks = useLiveQuery(async () => {
    const [days, sessions, exerciseSessions, sets] = await Promise.all([
      db.scheduledDays.toArray(),
      db.workoutSessions.toArray(),
      db.exerciseSessions.toArray(),
      db.setLogs.toArray(),
    ])
    const okSessions = filterDemo(sessions, includeDemo)
    const okExerciseSessions = filterDemo(exerciseSessions, includeDemo)
    const okSets = filterDemo(sets, includeDemo)

    const out: WeekAdherence[] = []
    for (const week of completedWeekStarts(todayKey, weekStartsOn)) {
      if (addDaysKey(week, 6) < programStart) continue // week ended before the program began
      const a = weeklyStrengthAdherence(
        week,
        todayKey,
        programStart,
        days,
        okSessions,
        okExerciseSessions,
        okSets,
        weekStartsOn,
      )
      out.push({
        week,
        done: a.completed,
        total: a.scheduled,
        // Extra sessions can push the ratio past 1; the chart caps at 100 and
        // the tooltip keeps the honest completed/scheduled counts.
        pct: a.pct == null ? null : Math.min(100, Math.round(a.pct * 100)),
      })
    }
    return out
  }, [includeDemo, weekStartsOn, programStart, todayKey])

  if (weeks === undefined) {
    return (
      <ChartCard title="Lifting adherence">
        <ChartLoading />
      </ChartCard>
    )
  }

  if (weeks.filter((w) => w.pct != null).length < 2) {
    return (
      <ChartCard title="Lifting adherence">
        <EmptyState
          title="Not enough completed weeks yet"
          body="After your program has been running for two full weeks, completed vs scheduled lifting sessions show up here week by week."
        />
      </ChartCard>
    )
  }

  return (
    <ChartCard title="Lifting adherence" subtitle="% · week starting">
      <AdherenceBars weeks={weeks} tooltipName="Sessions" />
    </ChartCard>
  )
}

/**
 * Weekly posture adherence: required posture days fully completed ÷ required
 * days per completed week, from the posture template's required weekdays and
 * the per-day logs. Matches the stat-tile rule (SPEC 10): a day counts only
 * when every item was completed. Computed directly in percent (0–100).
 */
export function PostureAdherenceChart({
  includeDemo,
  weekStartsOn,
  programStart,
  todayKey,
}: AdherenceChartProps) {
  const weeks = useLiveQuery(async () => {
    const [logs, template] = await Promise.all([
      db.postureRoutineLogs.toArray(),
      db.postureRoutineTemplates.get('posture'),
    ])
    const okLogs = filterDemo(logs, includeDemo)

    const out: WeekAdherence[] = []
    for (const week of completedWeekStarts(todayKey, weekStartsOn)) {
      if (addDaysKey(week, 6) < programStart) continue // week ended before the program began
      let total = 0
      let done = 0
      if (template) {
        for (const key of weekDateKeys(week, weekStartsOn)) {
          if (key < programStart) continue
          if (!template.requiredDays.includes(weekdayOfKey(key))) continue
          total++
          const log = okLogs.find((l) => l.dateKey === key)
          if (log && log.totalItems > 0 && log.completedItemIds.length >= log.totalItems) done++
        }
      }
      out.push({
        week,
        done,
        total,
        pct: total === 0 ? null : Math.min(100, Math.round((done / total) * 100)),
      })
    }
    return out
  }, [includeDemo, weekStartsOn, programStart, todayKey])

  if (weeks === undefined) {
    return (
      <ChartCard title="Posture adherence">
        <ChartLoading />
      </ChartCard>
    )
  }

  if (weeks.filter((w) => w.pct != null).length < 2) {
    return (
      <ChartCard title="Posture adherence">
        <EmptyState
          title="Not enough completed weeks yet"
          body="After two full weeks with required posture days, completed vs required days show up here week by week."
        />
      </ChartCard>
    )
  }

  return (
    <ChartCard title="Posture adherence" subtitle="% · week starting">
      <AdherenceBars weeks={weeks} tooltipName="Required days" />
    </ChartCard>
  )
}
