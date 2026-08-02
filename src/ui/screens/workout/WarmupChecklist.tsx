import { useMemo, useState } from 'react'
import { Card } from '../../components/core'
import { WARMUP_GENERAL, WARMUP_LOWER, WARMUP_UPPER } from '../../../lib/seed/seed'
import type { TemplateKind } from '../../../lib/types'

/**
 * Collapsible warm-up checklist (SPEC 9). Local component state only —
 * completion is never persisted and never affects adherence.
 */
export function WarmupChecklist({ templateKind }: { templateKind: TemplateKind }) {
  const items = useMemo(() => {
    const extra =
      templateKind === 'lower'
        ? WARMUP_LOWER
        : templateKind === 'upperA' || templateKind === 'upperB'
          ? WARMUP_UPPER
          : []
    return [...WARMUP_GENERAL, ...extra]
  }, [templateKind])
  const [done, setDone] = useState<ReadonlySet<number>>(new Set())
  const [open, setOpen] = useState(false)

  const toggle = (i: number) =>
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <Card className="p-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between px-4 py-2 text-left"
      >
        <span className="text-[14px] font-medium">Warm-up</span>
        <span className="tabular text-[13px] text-text-muted">
          {done.size}/{items.length} {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-2 pb-2">
          {items.map((item, i) => {
            const checked = done.has(i)
            return (
              <button
                key={item}
                onClick={() => toggle(i)}
                className="flex min-h-11 w-full items-center gap-3 px-2 text-left"
              >
                <span
                  aria-hidden
                  className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[11px] ${
                    checked ? 'border-accent bg-accent text-black' : 'border-border'
                  }`}
                >
                  {checked ? '✓' : ''}
                </span>
                <span
                  className={`text-[14px] ${checked ? 'text-text-muted line-through' : ''}`}
                >
                  {item}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </Card>
  )
}
