import { useLiveQuery } from 'dexie-react-hooks'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { db } from '../../../lib/db'
import { formatShort } from '../../../lib/dates'
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

/**
 * Body-fat estimate over time (SPEC 39 item 5). User-entered estimates from
 * daily body metrics as a single line, clearly labeled as estimates — never
 * presented as measured facts. The V1 stat tile stays; this adds the trend.
 */
export function BodyFatChart({ includeDemo }: { includeDemo: boolean }) {
  const entries = useLiveQuery(async () => {
    const rows = filterDemo(await db.bodyMetrics.orderBy('dateKey').toArray(), includeDemo)
    return rows
      .filter((m) => m.bodyFatPct != null)
      .map((m) => ({ dateKey: m.dateKey, bodyFat: m.bodyFatPct }))
  }, [includeDemo])

  if (entries === undefined) {
    return (
      <ChartCard title="Body fat">
        <ChartLoading />
      </ChartCard>
    )
  }

  if (entries.length < 2) {
    return (
      <ChartCard title="Body fat">
        <EmptyState
          title="Not enough body-fat entries yet"
          body="Log an estimated body-fat percentage on at least two days to see the trend here. These are rough estimates — the direction matters more than any single reading."
        />
      </ChartCard>
    )
  }

  return (
    <ChartCard title="Body fat" subtitle="% · estimate">
      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={entries} margin={CHART_MARGIN}>
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
              formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Estimate']}
            />
            <Line
              dataKey="bodyFat"
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
