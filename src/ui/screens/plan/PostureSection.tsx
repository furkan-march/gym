import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { newId, nowIso } from '../../../lib/ids'
import type { PostureItem, PostureRoutineTemplate, Weekday } from '../../../lib/types'
import { Button, Card, Chip, EmptyState, SectionTitle } from '../../components/core'
import { Loading, WEEKDAY_ORDER, WEEKDAY_SHORT, inputCls, monFirst } from './shared'

function save(patch: Partial<PostureRoutineTemplate>): void {
  void db.postureRoutineTemplates.update('posture', { ...patch, updatedAt: nowIso() })
}

/** Posture sub-section (SPEC 10/27): edit routine items and scheduled days. */
export function PostureSection() {
  const posture = useLiveQuery(
    async () => (await db.postureRoutineTemplates.get('posture')) ?? null,
    [],
  )

  if (posture === undefined) return <Loading />
  if (posture === null)
    return (
      <EmptyState title="No posture routine yet" body="Defaults are created on first launch." />
    )

  const updateItem = (index: number, patch: Partial<PostureItem>) => {
    const items = posture.items.map((item, i) => (i === index ? { ...item, ...patch } : item))
    save({ items })
  }

  const moveItem = (index: number, dir: -1 | 1) => {
    const items = [...posture.items]
    const a = items[index]
    const b = items[index + dir]
    if (!a || !b) return
    items[index] = b
    items[index + dir] = a
    save({ items })
  }

  const removeItem = (index: number) => {
    save({ items: posture.items.filter((_, i) => i !== index) })
  }

  const addItem = () => {
    save({
      items: [...posture.items, { id: newId(), name: 'New item', prescription: '2 × 10' }],
    })
  }

  const toggleDay = (wd: Weekday, kind: 'required' | 'optional') => {
    const sortDays = (arr: Weekday[]) => [...arr].sort((a, b) => monFirst(a) - monFirst(b))
    let required = posture.requiredDays.filter((d) => d !== wd)
    let optional = posture.optionalDays.filter((d) => d !== wd)
    if (kind === 'required' && !posture.requiredDays.includes(wd)) required = [...required, wd]
    if (kind === 'optional' && !posture.optionalDays.includes(wd)) optional = [...optional, wd]
    save({ requiredDays: sortDays(required), optionalDays: sortDays(optional) })
  }

  return (
    <div>
      <SectionTitle>Routine items</SectionTitle>
      <Card>
        {posture.items.length === 0 ? (
          <EmptyState title="No items yet" body="Add the first posture exercise below." />
        ) : (
          posture.items.map((item, i) => (
            <div
              key={item.id}
              className="flex items-center gap-1 border-b border-border py-2 last:border-b-0"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <input
                  aria-label={`Item ${i + 1} name`}
                  defaultValue={item.name}
                  onChange={(e) => updateItem(i, { name: e.target.value })}
                  className={inputCls}
                />
                <input
                  aria-label={`Item ${i + 1} prescription`}
                  defaultValue={item.prescription}
                  placeholder="e.g. 2 × 15"
                  onChange={(e) => updateItem(i, { prescription: e.target.value })}
                  className={`${inputCls} tabular text-[13px]`}
                />
              </div>
              <div className="flex flex-col">
                <button
                  aria-label={`Move item ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => moveItem(i, -1)}
                  className="min-h-11 min-w-11 text-text-muted disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  aria-label={`Move item ${i + 1} down`}
                  disabled={i === posture.items.length - 1}
                  onClick={() => moveItem(i, 1)}
                  className="min-h-11 min-w-11 text-text-muted disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
              <button
                aria-label={`Remove item ${i + 1}`}
                onClick={() => removeItem(i)}
                className="min-h-11 min-w-11 text-danger"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </Card>
      <Button className="mt-3 w-full" onClick={addItem}>
        Add item
      </Button>

      <SectionTitle>Required days</SectionTitle>
      <Card>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_ORDER.map((wd) => (
            <Chip
              key={wd}
              active={posture.requiredDays.includes(wd)}
              onClick={() => toggleDay(wd, 'required')}
            >
              {WEEKDAY_SHORT[wd]}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-text-muted">
          Required days count toward the posture streak and weekly adherence.
        </p>
      </Card>

      <SectionTitle>Optional days</SectionTitle>
      <Card>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_ORDER.map((wd) => (
            <Chip
              key={wd}
              active={posture.optionalDays.includes(wd)}
              onClick={() => toggleDay(wd, 'optional')}
            >
              {WEEKDAY_SHORT[wd]}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-text-muted">
          Optional days never affect the streak. A day can be required or optional, not both.
        </p>
      </Card>

      <p className="mt-4 px-1 text-[12px] text-text-muted">
        This routine supports mobility and muscular control but does not diagnose or treat a
        medical condition.
      </p>
    </div>
  )
}
