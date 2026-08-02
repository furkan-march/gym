import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { db } from '../../../lib/db'
import { formatShort, weekStartKey } from '../../../lib/dates'
import { EX } from '../../../lib/seed/seed'
import type { Weekday } from '../../../lib/types'
import { Chip, EmptyState } from '../../components/core'
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
import { MAIN_LIFTS, buildE1rmSeries, filterDemo } from './data'
import { fmtKg } from './format'

/**
 * Estimated 1RM by exercise (SPEC 20): best valid set per completed session
 * via the Epley formula, always labeled as an estimate. Per-dumbbell exercises
 * chart per-dumbbell values and say so; bodyweight movements chart effective
 * load and only produce points when a session bodyweight snapshot exists.
 */
export function E1rmChart({ includeDemo }: { includeDemo: boolean }) {
  const [selected, setSelected] = useState<string>(EX.benchPress)

  const data = useLiveQuery(async () => {
    const [sessions, exerciseSessions, sets, exercises] = await Promise.all([
      db.workoutSessions.toArray(),
      db.exerciseSessions.toArray(),
      db.setLogs.toArray(),
      db.exercises.toArray(),
    ])
    const series = buildE1rmSeries(
      filterDemo(sessions, includeDemo),
      filterDemo(exerciseSessions, includeDemo),
      filterDemo(sets, includeDemo),
    )
    return { series, exercises }
  }, [includeDemo])

  if (data === undefined) {
    return (
      <ChartCard title="Estimated 1RM">
        <ChartLoading />
      </ChartCard>
    )
  }

  // Fixed main-lift chips first, then any other exercise that has data.
  const mainIds = new Set(MAIN_LIFTS.map((l) => l.id))
  const extras = [...data.series.keys()]
    .filter((id) => !mainIds.has(id))
    .map((id) => ({ id, label: data.exercises.find((e) => e.id === id)?.name ?? id }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const chips = [...MAIN_LIFTS, ...extras]

  const exercise = data.exercises.find((e) => e.id === selected)
  const perDumbbell = exercise?.loadConvention === 'perDumbbell'
  const subtitleParts = ['estimate']
  if (perDumbbell) subtitleParts.push('per dumbbell')
  if (exercise?.kind === 'bodyweight') subtitleParts.push('effective load')

  const points = data.series.get(selected) ?? []

  return (
    <ChartCard title="Estimated 1RM" subtitle={subtitleParts.join(' · ')}>
      <div className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
        {chips.map((c) => (
          <Chip key={c.id} active={c.id === selected} onClick={() => setSelected(c.id)}>
            {c.label}
          </Chip>
        ))}
      </div>
      {points.length < 2 ? (
        <EmptyState
          title="Not enough sessions yet"
          body={
            exercise?.kind === 'bodyweight'
              ? `Complete at least two sessions of ${exercise?.name ?? 'this exercise'} with a bodyweight snapshot to chart its effective-load estimate.`
              : `Complete at least two sessions of ${exercise?.name ?? 'this exercise'} with valid sets (12 reps or fewer) to see the trend.`
          }
        />
      ) : (
        <div style={{ height: CHART_HEIGHT }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={CHART_MARGIN}>
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
                width={36}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                domain={['dataMin - 2', 'dataMax + 2']}
                tickFormatter={(v: number) => String(Math.round(v))}
              />
              <Tooltip
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                cursor={{ stroke: CHART.grid }}
                labelFormatter={(label) => formatShort(String(label))}
                formatter={(value) => [
                  `${fmtKg(Number(value))} kg${perDumbbell ? ' per dumbbell' : ''}`,
                  'e1RM estimate',
                ]}
              />
              <Line
                dataKey="e1rm"
                stroke={CHART.accent}
                strokeWidth={2}
                dot={{ r: 2.5, fill: CHART.accent, strokeWidth: 0 }}
                activeDot={{ r: 3.5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  )
}

/** Weekly working-set volume (SPEC 19): completed working sets per week. */
export function VolumeChart({
  includeDemo,
  weekStartsOn,
}: {
  includeDemo: boolean
  weekStartsOn: Weekday
}) {
  const weeks = useLiveQuery(async () => {
    const [sessions, sets] = await Promise.all([
      db.workoutSessions.toArray(),
      db.setLogs.toArray(),
    ])
    const sessionById = new Map(
      filterDemo(sessions, includeDemo)
        .filter((s) => s.status !== 'discarded')
        .map((s) => [s.id, s] as const),
    )
    const counts = new Map<string, number>()
    for (const set of filterDemo(sets, includeDemo)) {
      if (!set.completed || set.isWarmup) continue
      const session = sessionById.get(set.workoutSessionId)
      if (!session) continue
      const week = weekStartKey(session.dateKey, weekStartsOn)
      counts.set(week, (counts.get(week) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, count]) => ({ week, sets: count }))
  }, [includeDemo, weekStartsOn])

  if (weeks === undefined) {
    return (
      <ChartCard title="Weekly working sets">
        <ChartLoading />
      </ChartCard>
    )
  }

  if (weeks.length < 2) {
    return (
      <ChartCard title="Weekly working sets">
        <EmptyState
          title="Not enough training weeks yet"
          body="Completed working sets are counted per week. Train in at least two different weeks to see the trend."
        />
      </ChartCard>
    )
  }

  return (
    <ChartCard title="Weekly working sets" subtitle="completed sets · week starting">
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
              formatter={(value) => [`${value} sets`, 'Working sets']}
            />
            <Bar
              dataKey="sets"
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
