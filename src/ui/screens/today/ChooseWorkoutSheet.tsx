import type { WorkoutTemplate } from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { EmptyState, Row } from '../../components/core'

/**
 * Secondary action (SPEC 7): start any template on any day without modifying
 * the permanent schedule.
 */
export function ChooseWorkoutSheet({
  open,
  templates,
  onPick,
  onClose,
}: {
  open: boolean
  templates: WorkoutTemplate[]
  onPick: (template: WorkoutTemplate) => void
  onClose: () => void
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Choose another workout">
      <p className="mb-2 text-[13px] text-text-muted">
        Starts a workout without changing your weekly schedule.
      </p>
      {templates.length === 0 ? (
        <EmptyState title="No workout templates" body="Create one in Plan → Training." />
      ) : (
        <div className="divide-y divide-border">
          {templates.map((t) => (
            <Row
              key={t.id}
              onClick={() => onPick(t)}
              left={<span className="text-[15px]">{t.name}</span>}
              right={<span className="text-[13px] font-medium text-accent">Start</span>}
            />
          ))}
        </div>
      )}
    </BottomSheet>
  )
}
