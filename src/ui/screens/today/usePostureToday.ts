import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { upsertPostureLog } from '../../../lib/data/daily'
import { weekdayOfKey } from '../../../lib/dates'
import type { DateKey, PostureItem } from '../../../lib/types'

/**
 * Today's posture routine state (SPEC 7/10). The posture card and tile appear
 * only on scheduled days (postureTemplate.requiredDays / optionalDays); a day
 * counts as completed only when ALL items are done.
 */
export interface PostureToday {
  items: PostureItem[]
  completedIds: string[]
  /** weekday is in requiredDays or optionalDays */
  scheduled: boolean
  required: boolean
  allDone: boolean
  loading: boolean
  toggle: (itemId: string) => Promise<void>
}

export function usePostureToday(todayKey: DateKey): PostureToday {
  const template = useLiveQuery(() => db.postureRoutineTemplates.get('posture'), [])
  const log = useLiveQuery(async () => {
    const rows = await db.postureRoutineLogs.where('dateKey').equals(todayKey).toArray()
    return rows.find((r) => !r.isDemo) ?? null
  }, [todayKey])

  const weekday = weekdayOfKey(todayKey)
  const items = template?.items ?? []
  const completedIds = (log?.completedItemIds ?? []).filter((id) =>
    items.some((item) => item.id === id),
  )
  const required = template?.requiredDays.includes(weekday) ?? false
  const optional = template?.optionalDays.includes(weekday) ?? false

  const toggle = async (itemId: string) => {
    const next = completedIds.includes(itemId)
      ? completedIds.filter((id) => id !== itemId)
      : [...completedIds, itemId]
    await upsertPostureLog(todayKey, next, items.length)
  }

  return {
    items,
    completedIds,
    scheduled: required || optional,
    required,
    allDone: items.length > 0 && completedIds.length === items.length,
    loading: template === undefined || log === undefined,
    toggle,
  }
}
