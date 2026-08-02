import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { newId, nowIso } from '../../../lib/ids'
import type { AppSettings, SupplementItem } from '../../../lib/types'
import { Button, Card, EmptyState, SectionTitle } from '../../components/core'
import { updateSettings } from '../../hooks/useSettings'
import { Toggle } from './Toggle'

/**
 * Supplement checklist settings (SPEC 39 item 4). The checklist is DISABLED by
 * default and purely personal: fully editable, no dosage suggestions beyond the
 * user's own editable reminder notes, and no claims that supplements help or
 * are needed — every string here stays neutral.
 */

const inputCls =
  'min-h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-[15px] outline-none focus:border-accent'

function updateItem(
  id: string,
  patch: Partial<Pick<SupplementItem, 'name' | 'reminderNote'>>,
): void {
  void db.supplementItems.update(id, { ...patch, updatedAt: nowIso() })
}

/** Swap orderIndex with the neighbour in `dir`; no-op at either end. */
function moveItem(items: SupplementItem[], index: number, dir: -1 | 1): void {
  const a = items[index]
  const b = items[index + dir]
  if (!a || !b) return
  const t = nowIso()
  void db.transaction('rw', [db.supplementItems], async () => {
    await db.supplementItems.update(a.id, { orderIndex: b.orderIndex, updatedAt: t })
    await db.supplementItems.update(b.id, { orderIndex: a.orderIndex, updatedAt: t })
  })
}

function removeItem(id: string): void {
  // Past supplementLogs may keep the removed id in takenItemIds; the Today card
  // renders only ids still present in the list, so stale entries are inert.
  void db.supplementItems.delete(id)
}

function addItem(items: SupplementItem[]): void {
  const t = nowIso()
  const orderIndex = items.length === 0 ? 0 : Math.max(...items.map((i) => i.orderIndex)) + 1
  void db.supplementItems.add({
    id: newId(),
    name: 'New item',
    reminderNote: null,
    orderIndex,
    createdAt: t,
    updatedAt: t,
  })
}

export function SupplementsSection({ settings }: { settings: AppSettings }) {
  const items = useLiveQuery(() => db.supplementItems.orderBy('orderIndex').toArray(), [])

  return (
    <>
      <SectionTitle>Supplements</SectionTitle>
      <Card>
        <Toggle
          label="Supplement checklist"
          hint="Shows an optional personal checklist card on Today."
          checked={settings.supplementsEnabled}
          onChange={(v) => void updateSettings({ supplementsEnabled: v })}
        />
      </Card>
      {settings.supplementsEnabled ? (
        <>
          <Card className="mt-3">
            {items === undefined ? (
              <p className="py-4 text-center text-[14px] text-text-muted">Loading…</p>
            ) : items.length === 0 ? (
              <EmptyState title="Your list is empty" body="Add the first entry below." />
            ) : (
              items.map((item, i) => (
                <div
                  key={item.id}
                  className="flex items-center gap-1 border-b border-border py-2 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <input
                      aria-label={`Supplement ${i + 1} name`}
                      defaultValue={item.name}
                      onChange={(e) => updateItem(item.id, { name: e.target.value })}
                      className={inputCls}
                    />
                    <input
                      aria-label={`Supplement ${i + 1} reminder note`}
                      defaultValue={item.reminderNote ?? ''}
                      placeholder="Reminder note (optional)"
                      onChange={(e) =>
                        updateItem(item.id, {
                          reminderNote: e.target.value === '' ? null : e.target.value,
                        })
                      }
                      className={`${inputCls} text-[13px]`}
                    />
                  </div>
                  <div className="flex flex-col">
                    <button
                      aria-label={`Move supplement ${i + 1} up`}
                      disabled={i === 0}
                      onClick={() => moveItem(items, i, -1)}
                      className="min-h-11 min-w-11 text-text-muted disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Move supplement ${i + 1} down`}
                      disabled={i === items.length - 1}
                      onClick={() => moveItem(items, i, 1)}
                      className="min-h-11 min-w-11 text-text-muted disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                  <button
                    aria-label={`Remove supplement ${i + 1}`}
                    onClick={() => removeItem(item.id)}
                    className="min-h-11 min-w-11 text-danger"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </Card>
          <Button className="mt-3 w-full" onClick={() => items && addItem(items)}>
            Add item
          </Button>
          <p className="mt-2 px-1 text-[12px] text-text-muted">
            A personal checklist — this app makes no claims about supplements.
          </p>
        </>
      ) : null}
    </>
  )
}
