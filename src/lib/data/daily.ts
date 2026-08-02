import { db } from '../db'
import { newId, nowIso } from '../ids'
import type {
  BodyMetric,
  CardioSession,
  DailyActivity,
  DateKey,
  NutritionAdherenceLog,
  PostureRoutineLog,
} from '../types'

/**
 * Per-day record upserts (SPEC 29, DATE KEYS): one row per local dateKey;
 * writing again for the same day updates in place, never duplicates.
 */

export async function upsertBodyMetric(
  dateKey: DateKey,
  patch: Partial<Pick<BodyMetric, 'weightKg' | 'waistCm' | 'bodyFatPct'>>,
): Promise<void> {
  const t = nowIso()
  await db.transaction('rw', [db.bodyMetrics], async () => {
    const existing = await db.bodyMetrics.where('dateKey').equals(dateKey).first()
    if (existing) await db.bodyMetrics.update(existing.id, { ...patch, updatedAt: t })
    else
      await db.bodyMetrics.add({
        id: newId(),
        dateKey,
        weightKg: null,
        waistCm: null,
        bodyFatPct: null,
        ...patch,
        createdAt: t,
        updatedAt: t,
      })
  })
}

export async function upsertSteps(dateKey: DateKey, steps: number | null): Promise<void> {
  const t = nowIso()
  await db.transaction('rw', [db.dailyActivities], async () => {
    const existing = await db.dailyActivities.where('dateKey').equals(dateKey).first()
    if (existing) await db.dailyActivities.update(existing.id, { steps, updatedAt: t })
    else await db.dailyActivities.add({ id: newId(), dateKey, steps, createdAt: t, updatedAt: t } satisfies DailyActivity)
  })
}

export async function upsertNutrition(
  dateKey: DateKey,
  patch: Partial<Omit<NutritionAdherenceLog, 'id' | 'dateKey' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  const t = nowIso()
  await db.transaction('rw', [db.nutritionAdherenceLogs], async () => {
    const existing = await db.nutritionAdherenceLogs.where('dateKey').equals(dateKey).first()
    if (existing) await db.nutritionAdherenceLogs.update(existing.id, { ...patch, updatedAt: t })
    else
      await db.nutritionAdherenceLogs.add({
        id: newId(),
        dateKey,
        calories: 'notTracked',
        protein: 'notTracked',
        fruitVeg: null,
        water: null,
        hunger: null,
        ...patch,
        createdAt: t,
        updatedAt: t,
      })
  })
}

export async function upsertPostureLog(
  dateKey: DateKey,
  completedItemIds: string[],
  totalItems: number,
): Promise<void> {
  const t = nowIso()
  await db.transaction('rw', [db.postureRoutineLogs], async () => {
    const existing = await db.postureRoutineLogs.where('dateKey').equals(dateKey).first()
    if (existing)
      await db.postureRoutineLogs.update(existing.id, { completedItemIds, totalItems, updatedAt: t })
    else
      await db.postureRoutineLogs.add({
        id: newId(),
        dateKey,
        completedItemIds,
        totalItems,
        createdAt: t,
        updatedAt: t,
      } satisfies PostureRoutineLog)
  })
}

export async function addCardioSession(
  input: Omit<CardioSession, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<void> {
  const t = nowIso()
  await db.cardioSessions.add({ ...input, id: newId(), createdAt: t, updatedAt: t })
}
