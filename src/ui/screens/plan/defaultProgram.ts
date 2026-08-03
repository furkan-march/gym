import { TEMPLATE_IDS, buildDefaultProgram } from '../../../lib/seed/seed'

/**
 * "Restore defaults" reads the canonical program straight from seed.ts —
 * buildDefaultProgram is the single source of truth for the default program
 * (the former verbatim copy of the seed tables lived here and was a drift
 * risk; it is gone).
 */

export const DEFAULT_TEMPLATE_ID_LIST: string[] = [
  TEMPLATE_IDS.upperA,
  TEMPLATE_IDS.upperB,
  TEMPLATE_IDS.lower,
]

export { buildDefaultProgram }
