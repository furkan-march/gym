import { TEMPLATE_IDS, buildDefaultProgram } from '../../../lib/seed/seed'

/**
 * "Restore defaults" reads the canonical program straight from seed.ts —
 * buildDefaultProgram is the single source of truth for the default program.
 */

export const DEFAULT_TEMPLATE_ID_LIST: string[] = [
  TEMPLATE_IDS.pushA,
  TEMPLATE_IDS.pullA,
  TEMPLATE_IDS.legsA,
  TEMPLATE_IDS.pushB,
  TEMPLATE_IDS.pullB,
  TEMPLATE_IDS.legsB,
]

export { buildDefaultProgram }
