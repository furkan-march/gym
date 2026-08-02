import { useEffect, useState } from 'react'
import { addCardioSession } from '../../../lib/data/daily'
import type { CardioType, DateKey } from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { Button, Chip } from '../../components/core'
import { NumberField } from '../../components/NumberField'
import { Rating } from '../../components/Segmented'

/** Zone 2 quick log (SPEC 7, Wednesday): type, minutes, perceived intensity. */

const CARDIO_TYPES: { value: CardioType; label: string }[] = [
  { value: 'inclineTreadmill', label: 'Incline treadmill' },
  { value: 'outdoorWalk', label: 'Outdoor walk' },
  { value: 'stationaryBike', label: 'Bike' },
  { value: 'elliptical', label: 'Elliptical' },
  { value: 'rowing', label: 'Rowing' },
  { value: 'run', label: 'Run' },
  { value: 'other', label: 'Other' },
]

export function CardioSheet({
  open,
  todayKey,
  minutesMin,
  minutesMax,
  onClose,
}: {
  open: boolean
  todayKey: DateKey
  minutesMin: number | null
  minutesMax: number | null
  onClose: () => void
}) {
  const [type, setType] = useState<CardioType>('inclineTreadmill')
  const [minutes, setMinutes] = useState<number | null>(35)
  const [intensity, setIntensity] = useState(2)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setType('inclineTreadmill')
    setMinutes(35)
    setIntensity(2)
    setError(null)
  }, [open])

  const save = async () => {
    if (minutes == null || minutes <= 0) return
    try {
      await addCardioSession({
        dateKey: todayKey,
        type,
        minutes: Math.round(minutes),
        distanceKm: null,
        avgHeartRate: null,
        perceivedIntensity: intensity,
        isZone2: true,
      })
      onClose()
    } catch {
      setError('Could not save — the on-device storage write failed. Try again.')
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Log cardio">
      <div className="mb-1 text-[11px] text-text-muted">Type</div>
      <div className="flex flex-wrap gap-2">
        {CARDIO_TYPES.map((t) => (
          <Chip key={t.value} active={type === t.value} onClick={() => setType(t.value)}>
            {t.label}
          </Chip>
        ))}
      </div>
      <div className="mt-3">
        <NumberField label="Minutes" value={minutes} onChange={setMinutes} step={5} />
      </div>
      <div className="mt-3">
        <Rating label="Perceived intensity" value={intensity} onChange={setIntensity} />
      </div>
      {minutesMin != null && minutesMax != null ? (
        <div className="mt-2 text-[12px] text-text-muted">
          Zone 2 target: {minutesMin}–{minutesMax} min at an easy, conversational pace.
        </div>
      ) : null}
      {error ? <div className="mt-2 text-[13px] text-danger">{error}</div> : null}
      <Button
        variant="primary"
        className="mt-4 w-full"
        disabled={minutes == null || minutes <= 0}
        onClick={() => void save()}
      >
        Save
      </Button>
    </BottomSheet>
  )
}
