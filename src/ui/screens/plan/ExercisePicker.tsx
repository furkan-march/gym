import { useMemo, useState } from 'react'
import type { Exercise } from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { Button, EmptyState } from '../../components/core'
import { inputCls } from './shared'

/**
 * Exercise picker over the whole library (SPEC 27).
 * Single-select when `selectedIds` is omitted (parent closes on pick);
 * multi-select with checkmarks and a Done button when `selectedIds` is given.
 */
export function ExercisePicker({
  open,
  title,
  exercises,
  selectedIds,
  excludeIds,
  onToggle,
  onClose,
}: {
  open: boolean
  title: string
  exercises: Exercise[]
  /** presence switches the picker to multi-select mode */
  selectedIds?: string[]
  excludeIds?: string[]
  onToggle: (exerciseId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const multi = selectedIds !== undefined

  const list = useMemo(() => {
    const excluded = new Set(excludeIds ?? [])
    const q = query.trim().toLowerCase()
    return exercises
      .filter((e) => !e.isDemo && !excluded.has(e.id))
      .filter((e) => (q ? e.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [exercises, excludeIds, query])

  const close = () => {
    setQuery('')
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={close} title={title}>
      <input
        aria-label="Search exercises"
        placeholder="Search"
        className={inputCls}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mt-2">
        {list.length === 0 ? (
          <EmptyState title="No exercises match" body="Try a different search." />
        ) : (
          list.map((e) => {
            const selected = multi && (selectedIds?.includes(e.id) ?? false)
            return (
              <button
                key={e.id}
                onClick={() => onToggle(e.id)}
                className="flex min-h-11 w-full items-center justify-between border-b border-border text-left text-[15px] last:border-b-0"
              >
                <span>{e.name}</span>
                {multi ? (
                  <span
                    aria-hidden="true"
                    className={selected ? 'text-accent' : 'text-text-muted'}
                  >
                    {selected ? '✓' : ''}
                  </span>
                ) : null}
              </button>
            )
          })
        )}
      </div>
      {multi ? (
        <Button variant="primary" className="mt-3 w-full" onClick={close}>
          Done
        </Button>
      ) : null}
    </BottomSheet>
  )
}
