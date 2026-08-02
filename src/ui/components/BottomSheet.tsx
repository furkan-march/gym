import { useEffect, type ReactNode } from 'react'

/** iPhone-friendly modal bottom sheet (SPEC 32). */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        aria-label="Close"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="pb-safe relative max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        {title ? <h2 className="mb-3 text-lg font-semibold">{title}</h2> : null}
        {children}
      </div>
    </div>
  )
}
