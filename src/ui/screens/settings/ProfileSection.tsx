import { useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../../../lib/db'
import type { AppSettings, UserProfile } from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { NumberField } from '../../components/NumberField'
import { Button, Card, Row, SectionTitle } from '../../components/core'
import { updateProfile } from '../../hooks/useSettings'
import { fmtNum } from './format'

/**
 * PROFILE section (SPEC 28): name, height, estimated/target body fat and the
 * target weight range, each edited in a bottom sheet. Current weight is
 * read-only here — it is logged on the Today screen (single source of entry).
 */

type SheetKind = 'name' | 'height' | 'bodyfat' | 'weightRange'

function Value({ children }: { children: ReactNode }) {
  return <span className="tabular text-[14px] whitespace-nowrap text-text-muted">{children} ›</span>
}

export function ProfileSection({
  profile,
  settings,
}: {
  profile: UserProfile
  settings: AppSettings
}) {
  const navigate = useNavigate()
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [heightDraft, setHeightDraft] = useState<number | null>(null)
  const [estBfDraft, setEstBfDraft] = useState<number | null>(null)
  const [targetBfDraft, setTargetBfDraft] = useState<number | null>(null)
  const [weightMinDraft, setWeightMinDraft] = useState<number | null>(null)
  const [weightMaxDraft, setWeightMaxDraft] = useState<number | null>(null)

  const includeDemo = settings.demoDataEnabled === true
  const latestWeight = useLiveQuery(async () => {
    const rows = await db.bodyMetrics.toArray()
    const eligible = rows.filter(
      (r) => r.weightKg != null && (includeDemo || r.isDemo !== true),
    )
    eligible.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
    return eligible[0] ?? null
  }, [includeDemo])

  const precision = settings.decimalPrecision

  const open = (kind: SheetKind) => {
    if (kind === 'name') setNameDraft(profile.name)
    if (kind === 'height') setHeightDraft(profile.heightCm)
    if (kind === 'bodyfat') {
      setEstBfDraft(profile.estimatedBodyFatPct)
      setTargetBfDraft(profile.targetBodyFatPct)
    }
    if (kind === 'weightRange') {
      setWeightMinDraft(profile.targetWeightMinKg)
      setWeightMaxDraft(profile.targetWeightMaxKg)
    }
    setSheet(kind)
  }
  const close = () => setSheet(null)

  const saveName = async () => {
    const name = nameDraft.trim()
    if (name.length === 0) return
    await updateProfile({ name })
    close()
  }
  const saveHeight = async () => {
    if (heightDraft == null || heightDraft <= 0) return
    await updateProfile({ heightCm: heightDraft })
    close()
  }
  const saveBodyFat = async () => {
    if (targetBfDraft == null || targetBfDraft <= 0) return
    await updateProfile({
      estimatedBodyFatPct: estBfDraft,
      targetBodyFatPct: targetBfDraft,
    })
    close()
  }
  const weightRangeInvalid =
    weightMinDraft == null ||
    weightMaxDraft == null ||
    weightMinDraft <= 0 ||
    weightMinDraft > weightMaxDraft
  const saveWeightRange = async () => {
    if (weightRangeInvalid) return
    await updateProfile({
      targetWeightMinKg: weightMinDraft,
      targetWeightMaxKg: weightMaxDraft,
    })
    close()
  }

  return (
    <>
      <SectionTitle>Profile</SectionTitle>
      <Card>
        <div className="divide-y divide-border">
          <Row
            onClick={() => open('name')}
            left={<span className="text-[15px]">Name</span>}
            right={<Value>{profile.name}</Value>}
          />
          <Row
            onClick={() => open('height')}
            left={<span className="text-[15px]">Height</span>}
            right={<Value>{profile.heightCm} cm</Value>}
          />
          <Row
            onClick={() => open('bodyfat')}
            left={<span className="text-[15px]">Body fat</span>}
            right={
              <Value>
                {profile.estimatedBodyFatPct != null
                  ? `est ${fmtNum(profile.estimatedBodyFatPct, precision)}%`
                  : 'est —'}
                {' · target '}
                {fmtNum(profile.targetBodyFatPct, precision)}%
              </Value>
            }
          />
          <Row
            onClick={() => open('weightRange')}
            left={<span className="text-[15px]">Target weight</span>}
            right={
              <Value>
                {fmtNum(profile.targetWeightMinKg, precision)}–
                {fmtNum(profile.targetWeightMaxKg, precision)} kg
              </Value>
            }
          />
          <Row
            onClick={() => navigate('/')}
            left={
              <>
                <span className="block text-[15px]">Current weight</span>
                <span className="text-[12px] text-text-muted">Log weight on Today</span>
              </>
            }
            right={
              <Value>
                {latestWeight?.weightKg != null
                  ? `${fmtNum(latestWeight.weightKg, precision)} kg`
                  : '—'}
              </Value>
            }
          />
        </div>
      </Card>

      <BottomSheet open={sheet === 'name'} onClose={close} title="Name">
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          aria-label="Name"
          className="min-h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-[15px] outline-none"
        />
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={nameDraft.trim().length === 0}
            onClick={() => void saveName()}
          >
            Save
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'height'} onClose={close} title="Height">
        <NumberField label="Height" suffix="cm" value={heightDraft} onChange={setHeightDraft} />
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={heightDraft == null || heightDraft <= 0}
            onClick={() => void saveHeight()}
          >
            Save
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'bodyfat'} onClose={close} title="Body fat">
        <div className="space-y-3">
          <NumberField
            label="Estimated body fat"
            suffix="%"
            step={0.5}
            value={estBfDraft}
            onChange={setEstBfDraft}
          />
          <NumberField
            label="Target body fat"
            suffix="%"
            step={0.5}
            value={targetBfDraft}
            onChange={setTargetBfDraft}
          />
          <p className="text-[12px] text-text-muted">
            Estimates, not measurements — leave the estimate empty if unknown.
          </p>
        </div>
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={targetBfDraft == null || targetBfDraft <= 0}
            onClick={() => void saveBodyFat()}
          >
            Save
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'weightRange'} onClose={close} title="Target weight range">
        <div className="flex gap-3">
          <NumberField
            wide
            label="From"
            suffix="kg"
            step={0.5}
            value={weightMinDraft}
            onChange={setWeightMinDraft}
          />
          <NumberField
            wide
            label="To"
            suffix="kg"
            step={0.5}
            value={weightMaxDraft}
            onChange={setWeightMaxDraft}
          />
        </div>
        {weightMinDraft != null && weightMaxDraft != null && weightMinDraft > weightMaxDraft ? (
          <p className="mt-2 text-[13px] text-danger">
            The lower bound must not exceed the upper bound.
          </p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={weightRangeInvalid}
            onClick={() => void saveWeightRange()}
          >
            Save
          </Button>
        </div>
      </BottomSheet>
    </>
  )
}
