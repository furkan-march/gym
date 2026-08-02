import { NumberField } from '../../components/NumberField'
import { Card, SectionTitle } from '../../components/core'
import { updateSettings, useSettings } from '../../hooks/useSettings'
import { Loading } from './shared'

/** Cardio & steps sub-section (SPEC 25/27): weekly Zone 2 target and step range. */
export function CardioSection() {
  const settings = useSettings()
  if (!settings) return <Loading />

  return (
    <div>
      <SectionTitle>Zone 2 cardio</SectionTitle>
      <Card className="flex flex-col gap-3">
        <NumberField
          label="Weekly Zone 2 sessions"
          value={settings.weeklyZone2Target}
          step={1}
          min={0}
          onChange={(v) => {
            if (v != null) void updateSettings({ weeklyZone2Target: Math.round(v) })
          }}
        />
        <div className="flex gap-2">
          <NumberField
            wide
            label="Minutes min"
            value={settings.zone2MinutesMin}
            step={5}
            min={0}
            onChange={(v) => {
              if (v == null) return
              void updateSettings({
                zone2MinutesMin: v,
                zone2MinutesMax: Math.max(v, settings.zone2MinutesMax),
              })
            }}
          />
          <NumberField
            wide
            label="Minutes max"
            value={settings.zone2MinutesMax}
            step={5}
            min={0}
            onChange={(v) => {
              if (v == null) return
              void updateSettings({
                zone2MinutesMax: v,
                zone2MinutesMin: Math.min(v, settings.zone2MinutesMin),
              })
            }}
          />
        </div>
        <p className="text-[12px] text-text-muted">
          The scheduled cardio day is set in Training — mark a weekday as Zone 2. Pace should stay
          conversational: moderate effort, not a maximal interval session.
        </p>
      </Card>

      <SectionTitle>Daily steps</SectionTitle>
      <Card className="flex flex-col gap-3">
        <div className="flex gap-2">
          <NumberField
            wide
            label="Step target min"
            value={settings.stepTargetMin}
            step={500}
            min={0}
            onChange={(v) => {
              if (v == null) return
              void updateSettings({
                stepTargetMin: v,
                stepTargetMax: Math.max(v, settings.stepTargetMax),
              })
            }}
          />
          <NumberField
            wide
            label="Step target max"
            value={settings.stepTargetMax}
            step={500}
            min={0}
            onChange={(v) => {
              if (v == null) return
              void updateSettings({
                stepTargetMax: v,
                stepTargetMin: Math.min(v, settings.stepTargetMin),
              })
            }}
          />
        </div>
        <p className="text-[12px] text-text-muted">
          The step target applies every day, including lifting days. The lower bound counts as
          reaching the target.
        </p>
      </Card>
    </div>
  )
}
