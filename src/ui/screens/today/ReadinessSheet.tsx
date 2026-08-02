import { useEffect, useState } from 'react'
import type { ReadinessLog } from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { Button } from '../../components/core'
import { Rating } from '../../components/Segmented'

/**
 * Pre-workout readiness bottom sheet (SPEC 17). All fields prefill at 3 (or
 * from today's saved log when reopened via the chip). Save logs the values;
 * Skip logs nothing. It never blocks starting the workout.
 */

export interface ReadinessValues {
  sleep: number
  energy: number
  motivation: number
  soreness: number
  stress: number
  kneeComfort: number | null
  note?: string
}

export function ReadinessSheet({
  open,
  showKnee,
  existing,
  willStart,
  onSave,
  onSkip,
  onClose,
}: {
  open: boolean
  /** knee comfort row only for Lower sessions (SPEC 17) */
  showKnee: boolean
  /** today's saved log, for prefill when reopened via the chip */
  existing: ReadinessLog | null
  /** true when Save/Skip should start the workout afterwards */
  willStart: boolean
  onSave: (values: ReadinessValues) => void
  onSkip: () => void
  onClose: () => void
}) {
  const [sleep, setSleep] = useState(3)
  const [energy, setEnergy] = useState(3)
  const [motivation, setMotivation] = useState(3)
  const [soreness, setSoreness] = useState(3)
  const [stress, setStress] = useState(3)
  const [knee, setKnee] = useState(3)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    setSleep(existing?.sleep ?? 3)
    setEnergy(existing?.energy ?? 3)
    setMotivation(existing?.motivation ?? 3)
    setSoreness(existing?.soreness ?? 3)
    setStress(existing?.stress ?? 3)
    setKnee(existing?.kneeComfort ?? 3)
    setNote(existing?.note ?? '')
  }, [open, existing])

  return (
    <BottomSheet open={open} onClose={onClose} title="Readiness">
      <Rating label="Sleep" value={sleep} onChange={setSleep} />
      <Rating label="Energy" value={energy} onChange={setEnergy} />
      <Rating label="Motivation" value={motivation} onChange={setMotivation} />
      <Rating label="Soreness" value={soreness} onChange={setSoreness} />
      <Rating label="Stress" value={stress} onChange={setStress} />
      {showKnee ? <Rating label="Knee comfort" value={knee} onChange={setKnee} /> : null}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        aria-label="Readiness note"
        className="mt-3 min-h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-[15px] outline-none placeholder:text-text-muted"
      />
      <div className="mt-4 flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          onClick={() =>
            onSave({
              sleep,
              energy,
              motivation,
              soreness,
              stress,
              kneeComfort: showKnee ? knee : null,
              note: note.trim() === '' ? undefined : note.trim(),
            })
          }
        >
          {willStart ? 'Save & start' : 'Save'}
        </Button>
        <Button className="flex-1" onClick={onSkip}>
          {willStart ? 'Skip' : 'Cancel'}
        </Button>
      </div>
    </BottomSheet>
  )
}
