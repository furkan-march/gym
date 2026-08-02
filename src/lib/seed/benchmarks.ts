import { EX } from './seed'

/**
 * Late-2025 historical benchmarks (SPEC 1). Shown ONLY as first-session hints
 * labeled "old benchmark — may not be current"; never seeded as prescribed loads.
 */
export const HISTORICAL_BENCHMARKS: Record<string, string> = {
  [EX.pullUp]: '~10 strict reps at bodyweight (late 2025)',
  [EX.benchPress]: '~40 kg per dumbbell × 10 on dumbbell bench (late 2025, different implement)',
  [EX.inclineDbPress]: '~40 kg per dumbbell × 10 on flat dumbbell bench (late 2025)',
  [EX.squat]: '~80 kg (late 2025)',
  [EX.romanianDeadlift]: '~100 kg (late 2025)',
  [EX.overheadPress]: '~30 kg per dumbbell seated / landmine bar + ~20 kg (late 2025)',
  [EX.weightedDip]: '20+ reps at bodyweight (late 2025)',
}
