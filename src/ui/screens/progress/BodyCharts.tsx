import { useLiveQuery } from 'dexie-react-hooks'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { db } from '../../../lib/db'
import { formatShort } from '../../../lib/dates'
import { sevenDayAvg } from '../../../lib/engines/bodyMetrics'
import type { BodyMetric } from '../../../lib/types'
import { EmptyState } from '../../components/core'
import {
  AXIS_TICK,
  CHART,
  CHART_HEIGHT,
  CHART_MARGIN,
  ChartCard,
  ChartLegend,
  ChartLoading,
  TOOLTIP_CONTENT_STYLE,
  TOOLTIP_LABEL_STYLE,
} from './chartTheme'
import { filterDemo } from './data'

function useMetrics(includeDemo: boolean): BodyMetric[] | undefined {
  return useLiveQuery(
    async () => filterDemo(await db.bodyMetrics.orderBy('dateKey').toArray(), includeDemo),
    [includeDemo],
  )
}

/**
 * Body weight (SPEC 19): daily weigh-ins as a thin muted line with dots, the
 * 7-day average overlaid as the emphasized accent series — two related series,
 * one chart, one y-axis.
 */
export function BodyWeightChart({ includeDemo }: { includeDemo: boolean }) {
  const metrics = useMetrics(includeDemo)

  if (metrics === undefined) {
    return (
      <ChartCard title="Body weight">
        <ChartLoading />
      </ChartCard>
    )
  }

  const weighIns = metrics.filter((m) => m.weightKg != null)
  if (weighIns.length < 2) {
    return (
      <ChartCard title="Body weight">
        <EmptyState
          title="Not enough weigh-ins yet"
          body="Log your morning weight on at least two days to see the trend. The 7-day average appears once a week has 3 entries."
        />
      </ChartCard>
    )
  }

  const data = weighIns.map((m) => ({
    dateKey: m.dateKey,
    weight: m.weightKg,
    avg: sevenDayAvg(metrics, m.dateKey).avg,
  }))

  return (
    <ChartCard title="Body weight" subtitle="kg">
      <ChartLegend
        items={[
          { color: CHART.muted, label: 'Daily weigh-in' },
          { color: CHART.accent, label: '7-day average' },
        ]}
      />
      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={CHART_MARGIN}>
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
              domain={['dataMin - 0.4', 'dataMax + 0.4']}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              cursor={{ stroke: CHART.grid }}
              labelFormatter={(label) => formatShort(String(label))}
              formatter={(value, name) => [
                `${Number(value).toFixed(1)} kg`,
                name === 'weight' ? 'Weigh-in' : '7-day avg',
              ]}
            />
            <Line
              dataKey="weight"
              stroke={CHART.muted}
              strokeWidth={1}
              dot={{ r: 2, fill: CHART.muted, strokeWidth: 0 }}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
            <Line
              dataKey="avg"
              stroke={CHART.accent}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

/** Waist circumference trend (SPEC 19/22). */
export function WaistChart({ includeDemo }: { includeDemo: boolean }) {
  const metrics = useMetrics(includeDemo)

  if (metrics === undefined) {
    return (
      <ChartCard title="Waist">
        <ChartLoading />
      </ChartCard>
    )
  }

  const entries = metrics.filter((m) => m.waistCm != null)
  if (entries.length < 2) {
    return (
      <ChartCard title="Waist">
        <EmptyState
          title="Not enough waist entries yet"
          body="Measure your waist on at least two days (a weekly measurement works well) to see the trend here."
        />
      </ChartCard>
    )
  }

  const data = entries.map((m) => ({ dateKey: m.dateKey, waist: m.waistCm }))

  return (
    <ChartCard title="Waist" subtitle="cm">
      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={CHART_MARGIN}>
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
              domain={['dataMin - 1', 'dataMax + 1']}
              tickFormatter={(v: number) => String(Math.round(v * 10) / 10)}
            />
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              cursor={{ stroke: CHART.grid }}
              labelFormatter={(label) => formatShort(String(label))}
              formatter={(value) => [`${Number(value).toFixed(1)} cm`, 'Waist']}
            />
            <Line
              dataKey="waist"
              stroke={CHART.accent}
              strokeWidth={2}
              dot={{ r: 2.5, fill: CHART.accent, strokeWidth: 0 }}
              activeDot={{ r: 3.5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
