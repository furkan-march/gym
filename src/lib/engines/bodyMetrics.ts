import type { BodyMetric, DateKey } from '../types'
import { addDaysKey } from '../dates'

/**
 * Body-metric trend engine (SPEC 19, 22, 24 DEFINITIONS).
 * Pure functions over plain BodyMetric arrays; 'today' is always a parameter.
 *
 * Percentage convention: every *Pct value in this module is in PERCENT UNITS
 * (a 0.5% weekly loss is returned as -0.5, not -0.005). The excessive-loss
 * threshold below is expressed in the same units.
 */

/** Minimum weigh-ins inside a 7-day window before an average is valid (SPEC 24). */
export const MIN_ENTRIES_FOR_AVG = 3

/** The 7-day average must sit at least this far (kg) below the average 14 days ago to count as progress. */
export const PLATEAU_MIN_DROP_KG = 0.1

/** Weekly loss above this percent of body weight is excessive (SPEC 24, "approximately 0.8%"). */
export const EXCESSIVE_LOSS_PCT_PER_WEEK = 0.8

/** Waist trend window: entries within the trailing ~28 calendar days. */
export const WAIST_TREND_WINDOW_DAYS = 28

/** Newer-half vs older-half waist means must differ by at least this many cm to call a trend. */
export const WAIST_TREND_THRESHOLD_CM = 0.5

export interface SevenDayAvgResult {
  /** Mean of weigh-ins in the trailing 7 calendar days incl. endKey; null when count < 3. */
  avg: number | null
  /** Number of weigh-ins found in the window (always reported, even when avg is null). */
  count: number
}

/** Weigh-in values whose dateKey falls in [endKey - 6, endKey]. DateKeys compare lexicographically. */
function weighInsInWindow(metrics: BodyMetric[], endKey: DateKey): number[] {
  const startKey = addDaysKey(endKey, -6)
  const values: number[] = []
  for (const m of metrics) {
    if (m.weightKg != null && m.dateKey >= startKey && m.dateKey <= endKey) {
      values.push(m.weightKg)
    }
  }
  return values
}

function mean(values: number[]): number {
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

/**
 * 7-day average weight = mean of all weigh-ins in the trailing 7 calendar days
 * including endKey; only valid when at least 3 entries exist (SPEC 24 DEFINITIONS).
 */
export function sevenDayAvg(metrics: BodyMetric[], endKey: DateKey): SevenDayAvgResult {
  const values = weighInsInWindow(metrics, endKey)
  if (values.length < MIN_ENTRIES_FOR_AVG) return { avg: null, count: values.length }
  return { avg: mean(values), count: values.length }
}

/**
 * Weekly percentage change = (current week's 7-day average - previous week's) / previous week's,
 * in percent units. Null when either window lacks 3 weigh-ins.
 */
export function weeklyChangePct(metrics: BodyMetric[], weekEndKey: DateKey): number | null {
  const current = sevenDayAvg(metrics, weekEndKey)
  const previous = sevenDayAvg(metrics, addDaysKey(weekEndKey, -7))
  if (current.avg == null || previous.avg == null) return null
  return ((current.avg - previous.avg) / previous.avg) * 100
}

/**
 * Plateau = the 7-day average today is NOT at least 0.1 kg below the 7-day average
 * 14 days ago. Requires at least 3 weigh-ins in each window; returns false otherwise
 * (insufficient data must never trigger an adjustment).
 */
export function isPlateau(metrics: BodyMetric[], todayKey: DateKey): boolean {
  const today = sevenDayAvg(metrics, todayKey)
  const twoWeeksAgo = sevenDayAvg(metrics, addDaysKey(todayKey, -14))
  if (today.avg == null || twoWeeksAgo.avg == null) return false
  return today.avg > twoWeeksAgo.avg - PLATEAU_MIN_DROP_KG
}

/**
 * Excessive loss = trailing weekly loss > 0.8% of body weight, computed from 7-day
 * averages. Both windows need 3+ weigh-ins, so a single unusual weigh-in can never
 * trigger this on its own.
 */
export function isExcessiveLoss(metrics: BodyMetric[], todayKey: DateKey): boolean {
  const current = sevenDayAvg(metrics, todayKey)
  const previous = sevenDayAvg(metrics, addDaysKey(todayKey, -7))
  if (current.avg == null || previous.avg == null) return false
  const lossPct = ((previous.avg - current.avg) / previous.avg) * 100
  return lossPct > EXCESSIVE_LOSS_PCT_PER_WEEK
}

export type WaistTrend = 'decreasing' | 'stable' | 'increasing' | null

/**
 * Waist trend over the last ~28 days of waist entries: compares the mean of the
 * newer half of entries against the older half. Null with fewer than 2 entries.
 */
export function waistTrend(metrics: BodyMetric[], todayKey: DateKey): WaistTrend {
  const startKey = addDaysKey(todayKey, -(WAIST_TREND_WINDOW_DAYS - 1))
  const entries: { dateKey: DateKey; waistCm: number }[] = []
  for (const m of metrics) {
    if (m.waistCm != null && m.dateKey >= startKey && m.dateKey <= todayKey) {
      entries.push({ dateKey: m.dateKey, waistCm: m.waistCm })
    }
  }
  if (entries.length < 2) return null
  entries.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0))
  const mid = Math.floor(entries.length / 2)
  const olderMean = mean(entries.slice(0, mid).map((e) => e.waistCm))
  const newerMean = mean(entries.slice(mid).map((e) => e.waistCm))
  const diff = newerMean - olderMean
  if (diff <= -WAIST_TREND_THRESHOLD_CM) return 'decreasing'
  if (diff >= WAIST_TREND_THRESHOLD_CM) return 'increasing'
  return 'stable'
}
