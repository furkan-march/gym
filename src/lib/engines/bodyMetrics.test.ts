import type { BodyMetric } from '../types'
import {
  isExcessiveLoss,
  isPlateau,
  sevenDayAvg,
  waistTrend,
  weeklyChangePct,
} from './bodyMetrics'

const T = '2026-08-01T10:00:00.000Z'

function metric(
  dateKey: string,
  weightKg: number | null,
  waistCm: number | null = null,
): BodyMetric {
  return {
    id: `bm-${dateKey}`,
    dateKey,
    weightKg,
    waistCm,
    bodyFatPct: null,
    createdAt: T,
    updatedAt: T,
  }
}

describe('sevenDayAvg', () => {
  it('averages sparse weigh-ins in the trailing 7 calendar days including the end date', () => {
    const metrics = [
      metric('2026-08-02', 90.0), // 7 days before end -> outside the window
      metric('2026-08-03', 87.0), // window start boundary
      metric('2026-08-05', 86.5),
      metric('2026-08-09', 86.0), // end boundary
    ]
    const result = sevenDayAvg(metrics, '2026-08-09')
    expect(result.count).toBe(3)
    expect(result.avg).toBeCloseTo((87.0 + 86.5 + 86.0) / 3, 10) // 86.5
  })

  it('returns null avg (but the real count) when fewer than 3 weigh-ins exist', () => {
    const metrics = [metric('2026-08-04', 86.8), metric('2026-08-07', 86.6)]
    expect(sevenDayAvg(metrics, '2026-08-09')).toEqual({ avg: null, count: 2 })
    expect(sevenDayAvg([], '2026-08-09')).toEqual({ avg: null, count: 0 })
  })

  it('ignores waist-only entries with no weight', () => {
    const metrics = [
      metric('2026-08-04', 86.8),
      metric('2026-08-05', null, 88.0),
      metric('2026-08-06', 86.6),
    ]
    expect(sevenDayAvg(metrics, '2026-08-09')).toEqual({ avg: null, count: 2 })
  })
})

describe('weeklyChangePct', () => {
  const metrics = [
    // previous window (2026-07-27 .. 2026-08-02), avg 86.9
    metric('2026-07-28', 87.0),
    metric('2026-07-30', 86.9),
    metric('2026-08-01', 86.8),
    // current window (2026-08-03 .. 2026-08-09), avg 86.4
    metric('2026-08-04', 86.6),
    metric('2026-08-06', 86.4),
    metric('2026-08-08', 86.2),
  ]

  it('computes (current - previous) / previous in percent units', () => {
    // (86.4 - 86.9) / 86.9 * 100 = -0.575373...
    expect(weeklyChangePct(metrics, '2026-08-09')).toBeCloseTo(-0.575374, 4)
  })

  it('returns null when the previous window lacks 3 weigh-ins', () => {
    const sparse = metrics.filter((m) => m.dateKey !== '2026-07-30')
    expect(weeklyChangePct(sparse, '2026-08-09')).toBeNull()
  })

  it('returns null when the current window lacks 3 weigh-ins', () => {
    const sparse = metrics.filter((m) => m.dateKey !== '2026-08-06')
    expect(weeklyChangePct(sparse, '2026-08-09')).toBeNull()
  })
})

describe('isPlateau', () => {
  it('is true when the 7-day average has not dropped at least 0.1 kg in 14 days', () => {
    const flat = [
      // window ending 14 days before today (2026-08-04 .. 2026-08-10), avg 86.5667
      metric('2026-08-05', 86.6),
      metric('2026-08-07', 86.5),
      metric('2026-08-09', 86.6),
      // window ending today (2026-08-18 .. 2026-08-24), avg 86.5 -> drop only 0.0667
      metric('2026-08-19', 86.5),
      metric('2026-08-21', 86.5),
      metric('2026-08-23', 86.5),
    ]
    expect(isPlateau(flat, '2026-08-24')).toBe(true)
  })

  it('is false when weight clearly decreased', () => {
    const losing = [
      metric('2026-08-05', 87.0),
      metric('2026-08-07', 87.0),
      metric('2026-08-09', 87.0),
      metric('2026-08-19', 86.5),
      metric('2026-08-21', 86.5),
      metric('2026-08-23', 86.5),
    ]
    expect(isPlateau(losing, '2026-08-24')).toBe(false)
  })

  it('is false when either window lacks 3 weigh-ins', () => {
    const sparse = [
      metric('2026-08-05', 86.6),
      metric('2026-08-09', 86.6), // only 2 entries 14 days ago
      metric('2026-08-19', 86.5),
      metric('2026-08-21', 86.5),
      metric('2026-08-23', 86.5),
    ]
    expect(isPlateau(sparse, '2026-08-24')).toBe(false)
    expect(isPlateau([], '2026-08-24')).toBe(false)
  })
})

describe('isExcessiveLoss', () => {
  it('is true when the trailing weekly loss exceeds 0.8% of body weight', () => {
    const fast = [
      // previous window (2026-08-11 .. 2026-08-17), avg 86.5
      metric('2026-08-12', 86.5),
      metric('2026-08-14', 86.5),
      metric('2026-08-16', 86.5),
      // current window (2026-08-18 .. 2026-08-24), avg 85.5 -> loss 1.156%
      metric('2026-08-19', 85.6),
      metric('2026-08-21', 85.5),
      metric('2026-08-23', 85.4),
    ]
    expect(isExcessiveLoss(fast, '2026-08-24')).toBe(true)
  })

  it('is false for a loss within the target range', () => {
    const steady = [
      metric('2026-08-12', 86.5),
      metric('2026-08-14', 86.5),
      metric('2026-08-16', 86.5),
      // avg 86.1 -> loss 0.462%
      metric('2026-08-19', 86.2),
      metric('2026-08-21', 86.1),
      metric('2026-08-23', 86.0),
    ]
    expect(isExcessiveLoss(steady, '2026-08-24')).toBe(false)
  })

  it('is never triggered by a single unusual weigh-in', () => {
    const oneOdd = [
      metric('2026-08-12', 86.5),
      metric('2026-08-14', 86.5),
      metric('2026-08-16', 86.5),
      metric('2026-08-23', 84.0), // lone outlier: current window has < 3 entries
    ]
    expect(isExcessiveLoss(oneOdd, '2026-08-24')).toBe(false)
  })
})

describe('waistTrend', () => {
  it('detects a decreasing trend', () => {
    const metrics = [
      metric('2026-07-29', null, 88.0),
      metric('2026-08-03', null, 87.6),
      metric('2026-08-15', null, 86.8),
      metric('2026-08-22', null, 86.6),
    ]
    expect(waistTrend(metrics, '2026-08-24')).toBe('decreasing')
  })

  it('detects an increasing trend', () => {
    const metrics = [
      metric('2026-07-29', null, 86.6),
      metric('2026-08-03', null, 86.8),
      metric('2026-08-15', null, 87.6),
      metric('2026-08-22', null, 88.0),
    ]
    expect(waistTrend(metrics, '2026-08-24')).toBe('increasing')
  })

  it('reports stable when halves differ by less than the threshold', () => {
    const metrics = [
      metric('2026-07-29', null, 87.0),
      metric('2026-08-03', null, 87.2),
      metric('2026-08-15', null, 87.1),
      metric('2026-08-22', null, 86.9),
    ]
    expect(waistTrend(metrics, '2026-08-24')).toBe('stable')
  })

  it('returns null with fewer than 2 waist entries', () => {
    expect(waistTrend([metric('2026-08-15', null, 87.0)], '2026-08-24')).toBeNull()
    expect(waistTrend([], '2026-08-24')).toBeNull()
    // weight-only entries do not count as waist entries
    expect(
      waistTrend([metric('2026-08-10', 86.5), metric('2026-08-15', 86.4)], '2026-08-24'),
    ).toBeNull()
  })

  it('ignores waist entries older than the 28-day window', () => {
    const metrics = [
      metric('2026-07-25', null, 90.0), // outside window (starts 2026-07-28)
      metric('2026-08-01', null, 87.0),
      metric('2026-08-20', null, 86.9),
    ]
    // With the old 90.0 excluded the halves differ by only 0.1 -> stable.
    expect(waistTrend(metrics, '2026-08-24')).toBe('stable')
  })
})
