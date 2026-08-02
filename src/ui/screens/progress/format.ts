/**
 * Progress-screen number formats (SPEC 19/20/32): kilograms with at most one
 * decimal, grouped integers, signed percent deltas. Percent inputs are already
 * in percent units (66.7 = 66.7%) — never multiplied here.
 */

/** "62.5", "80" — up to one decimal, no trailing zero. */
export function fmtKg(v: number): string {
  return String(Math.round(v * 10) / 10)
}

/** "8,432" — grouped for legibility. */
export function fmtInt(v: number): string {
  return Math.round(v).toLocaleString('en-US')
}

/** "-0.5%" / "+0.3%" — one decimal, explicit sign for gains. */
export function fmtSignedPct(v: number): string {
  const r = Math.round(v * 10) / 10
  return `${r > 0 ? '+' : ''}${r.toFixed(1)}%`
}

/** "67%" — whole-percent display for adherence values. */
export function fmtPct(v: number): string {
  return `${Math.round(v)}%`
}
