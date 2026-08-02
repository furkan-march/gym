import { BottomSheet } from './BottomSheet'
import { Button } from './core'

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body?: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <BottomSheet open={open} onClose={onCancel} title={title}>
      {body ? <p className="mb-4 text-[14px] text-text-muted">{body}</p> : null}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} className="flex-1" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </BottomSheet>
  )
}
