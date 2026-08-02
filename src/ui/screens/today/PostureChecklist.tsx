import type { PostureItem } from '../../../lib/types'
import { EmptyState } from '../../components/core'

/**
 * Posture routine checklist rows (SPEC 10). A day counts as completed only
 * when ALL items are done — the parent derives that from `completedIds`.
 */
export function PostureChecklist({
  items,
  completedIds,
  onToggle,
}: {
  items: PostureItem[]
  completedIds: string[]
  onToggle: (itemId: string) => void
}) {
  if (items.length === 0) {
    return <EmptyState title="No posture items" body="Add items in Plan → Posture." />
  }
  return (
    <div className="divide-y divide-border">
      {items.map((item) => {
        const done = completedIds.includes(item.id)
        return (
          <button
            key={item.id}
            onClick={() => onToggle(item.id)}
            aria-pressed={done}
            className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left"
          >
            <div className="min-w-0">
              <div className={`text-[14px] ${done ? 'text-text-muted' : ''}`}>{item.name}</div>
              <div className="text-[12px] text-text-muted">{item.prescription}</div>
            </div>
            <span
              aria-hidden
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[13px] ${
                done ? 'border-accent bg-accent/15 text-accent' : 'border-border text-transparent'
              }`}
            >
              ✓
            </span>
          </button>
        )
      })}
    </div>
  )
}
