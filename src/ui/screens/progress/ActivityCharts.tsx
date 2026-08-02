import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { db } from '../../../lib/db'
import { addDaysKey, formatShort, weekStartKey } from '../../../lib/dates'
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
import { fmtInt } from './format'

/** Trailing window shown in the daily steps chart. */
const STEPS_WINDOW_DAYS = 30

/** Daily steps (SPEC 19/25): bars with the step target as a reference line. */
export function StepsChart({
  includeDemo,
  stepTargetMin,
  todayKey,
}: {
  includeDemo: boolean
  stepTargetMin: number
  todayKey: DateKey
}) {
  const firstKey = addDaysKey(todayKey, -(STEPS_WINDOW_DAYS - 1))

  const days = useLiveQuery(async () => {
    const rows = filterDemo(await db.dailyActivities.orderBy('dateKey').toArray(), includeDemo)
    return rows
      .filter((d) => d.steps != null && d.dateKey >= firstKey && d.dateKey <= todayKey)
      .map((d) => ({ dateKey: d.dateKey, steps: d.steps }))
  }, [includeDemo, firstKey, todayKey])

  if (days === undefined) {
    return (
      <ChartCard title="Daily steps">
        <ChartLoading />
      </ChartCard>
    )
  }

  if (days.length < 2) {
    return (
      <ChartCard title="Daily steps">
        <EmptyState
          title="Not enough step entries yet"
          body="Log your steps on at least two days to see them here, compared against your daily target."
        />
      </ChartCard>
    )
  }

  return (
    <ChartCard title="Daily steps" subtitle={`last 30 days · target ${fmtInt(stepTargetMin)}+`}>
      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={days} margin={CHART_MARGIN}>
            <CartesianGrid stroke={CHART.grid} vertical={false} strokeOpacity={0.6} />
            <XAxis
              dataKey="dateKey"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: CHART.grid }}
              tickFormatter={(v: string) => formatShort(v)}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              width={32}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
            />
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              labelFormatter={(label) => formatShort(String(label))}
              formatter={(value) => [fmtInt(Number(value)), 'Steps']}
            />
            <ReferenceLine
              y={stepTargetMin}
              stroke={CHART.warning}
              strokeDasharray="4 3"
              strokeWidth={1}
            />
            <Bar
              dataKey="steps"
              fill={CHART.accent}
              radius={[4, 4, 0, 0]}
              maxBarSize={12}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

/** Weekly cardio minutes (SPEC 19/25). */
export function CardioChart({
  includeDemo,
  weekStartsOn,
}: {
  includeDemo: boolean
  weekStartsOn: Weekday
}) {
  const weeks = useLiveQuery(async () => {
    const rows = filterDemo(await db.cardioSessions.toArray(), includeDemo)
    const minutes = new Map<string, number>()
    for (const c of rows) {
      const week = weekStartKey(c.dateKey, weekStartsOn)
      minutes.set(week, (minutes.get(week) ?? 0) + c.minutes)
    }
    return [...minutes.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, mins]) => ({ week, minutes: mins }))
  }, [includeDemo, weekStartsOn])

  if (weeks === undefined) {
    return (
      <ChartCard title="Weekly cardio">
        <ChartLoading />
      </ChartCard>
    )
  }

  if (weeks.length < 2) {
    return (
      <ChartCard title="Weekly cardio">
        <EmptyState
          title="Not enough cardio logged yet"
          body="Log cardio sessions in at least two different weeks to see weekly minutes here."
        />
      </ChartCard>
    )
  }

  return (
    <ChartCard title="Weekly cardio" subtitle="minutes · week starting">
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
              width={30}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              labelFormatter={(label) => `Week of ${formatShort(String(label))}`}
              formatter={(value) => [`${value} min`, 'Cardio']}
            />
            <Bar
              dataKey="minutes"
              fill={CHART.accent}
              radius={[4, 4, 0, 0]}
              maxBarSize={18}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
