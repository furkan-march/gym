import type { ReactNode } from 'react'
import { Card } from '../../components/core'

/**
 * Shared chart styling (SPEC 19/32): one restrained accent series color,
 * recessive muted axes and grid, tight margins so charts stay readable at
 * iPhone width. Values mirror the design tokens in src/index.css — Recharts
 * sets SVG presentation attributes, which cannot resolve CSS var().
 */
export const CHART = {
  accent: '#4cc38a',
  muted: '#9aa1a8',
  grid: '#2e3338',
  warning: '#d9a444',
  surface: '#1a1d20',
  text: '#f2f2f0',
} as const

export const AXIS_TICK = { fontSize: 10, fill: CHART.muted } as const

export const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: CHART.surface,
  border: `1px solid ${CHART.grid}`,
  borderRadius: 12,
  fontSize: 12,
  color: CHART.text,
} as const

export const TOOLTIP_LABEL_STYLE = { color: CHART.muted } as const

/** Standard chart height — tall enough to read, short enough for one thumb-scroll. */
export const CHART_HEIGHT = 210

export const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const

/** One chart per card — never multiple unrelated series in one plot (SPEC 19). */
export function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <Card className="mt-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {subtitle ? <span className="text-[11px] text-text-muted">{subtitle}</span> : null}
      </div>
      <div className="mt-2">{children}</div>
    </Card>
  )
}

/** Compact series legend — identity is never carried by color alone. */
export function ChartLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  )
}

export function ChartLoading() {
  return <p className="py-8 text-center text-[13px] text-text-muted">Loading…</p>
}
