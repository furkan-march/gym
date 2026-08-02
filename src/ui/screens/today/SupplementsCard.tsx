import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { newId, nowIso } from '../../../lib/ids'
import { Card, Chip, EmptyState } from '../../components/core'
import { useSettings } from '../../hooks/useSettings'

/**
 * Optional supplement checklist card (SPEC 39 item 4). Renders nothing while
 * the checklist is disabled in Settings. Purely a personal tick list: one
 * SupplementLog row per local dateKey, no streaks, no adherence metrics, and
 * no claims about supplements anywhere in the copy.
 */

/** One row per dateKey (unique index): toggle `itemId` in takenItemIds. */
async function toggleTaken(dateKey: string, itemId: string): Promise<void> {
  const t = nowIso()
  await db.transaction('rw', [db.supplementLogs], async () => {
    const existing = await db.supplementLogs.where('dateKey').equals(dateKey).first()
    if (existing) {
      const takenItemIds = existing.takenItemIds.includes(itemId)
        ? existing.takenItemIds.filter((id) => id !== itemId)
        : [...existing.takenItemIds, itemId]
      await db.supplementLogs.update(existing.id, { takenItemIds, updatedAt: t })
    } else {
      await db.supplementLogs.add({
        id: newId(),
        dateKey,
        takenItemIds: [itemId],
        createdAt: t,
        updatedAt: t,
      })
    }
  })
}

export function SupplementsCard({ todayKey }: { todayKey: string }) {
  const [error, setError] = useState<string | null>(null)
  const settings = useSettings()
  const items = useLiveQuery(() => db.supplementItems.orderBy('orderIndex').toArray(), [])
  const log = useLiveQuery(
    async () => (await db.supplementLogs.where('dateKey').equals(todayKey).first()) ?? null,
    [todayKey],
  )

  if (!settings?.supplementsEnabled) return null
  if (items === undefined || log === undefined) {
    return <div className="h-20 rounded-2xl border border-border bg-surface" aria-hidden />
  }

  const taken = log?.takenItemIds ?? []

  return (
    <Card>
      <div className="mb-2 text-[15px] font-medium">Supplements</div>
      {items.length === 0 ? (
        <EmptyState title="Your list is empty" body="Edit it in Settings → Supplements." />
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <Chip
              key={item.id}
              active={taken.includes(item.id)}
              onClick={() =>
                void toggleTaken(todayKey, item.id).catch(() =>
                  setError('Could not save — the on-device storage write failed.'),
                )
              }
            >
              <span className="block">{item.name}</span>
              {item.reminderNote ? (
                <span className="block text-[10px] text-text-muted">{item.reminderNote}</span>
              ) : null}
            </Chip>
          ))}
        </div>
      )}
      {error ? <div className="mt-2 text-[13px] text-danger">{error}</div> : null}
    </Card>
  )
}
