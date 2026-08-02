import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { APP_VERSION, db } from '../../lib/db'
import type { AppSettings } from '../../lib/types'
import { Segmented } from '../components/Segmented'
import { Card, EmptyState, Row, SectionTitle } from '../components/core'
import { updateSettings } from '../hooks/useSettings'
import { DataSection } from './settings/DataSection'
import { ProfileSection } from './settings/ProfileSection'
import { Toggle } from './settings/Toggle'
import { TrainingSection } from './settings/TrainingSection'

/**
 * Settings screen (SPEC 28): profile, training, display, feedback, activity &
 * nutrition links, data management (SPEC 30/34) and about. All reads are live
 * queries; all writes go through updateSettings/updateProfile.
 */

function DisplaySection({ settings }: { settings: AppSettings }) {
  return (
    <>
      <SectionTitle>Display</SectionTitle>
      <Card className="space-y-4">
        <Segmented
          label="Theme"
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'System' },
          ]}
          value={settings.theme}
          onChange={(v) => void updateSettings({ theme: v })}
        />
        <Segmented
          label="Decimal precision"
          options={[
            { value: '1', label: '1 decimal' },
            { value: '2', label: '2 decimals' },
          ]}
          value={String(settings.decimalPrecision) as '1' | '2'}
          onChange={(v) => void updateSettings({ decimalPrecision: v === '2' ? 2 : 1 })}
        />
        <div>
          <Segmented
            label="Dumbbell load means"
            options={[
              { value: 'perDumbbell', label: 'Per dumbbell' },
              { value: 'combined', label: 'Combined' },
            ]}
            value={settings.dumbbellConvention}
            onChange={(v) => void updateSettings({ dumbbellConvention: v })}
          />
          <p className="mt-1.5 text-[12px] text-text-muted">
            Affects future logging only — history keeps its stored meaning.
          </p>
        </div>
        <Toggle
          label="Reduced motion"
          checked={settings.reducedMotion}
          onChange={(v) => void updateSettings({ reducedMotion: v })}
        />
        <Segmented
          label="Set-row density"
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'comfortable', label: 'Comfortable' },
          ]}
          value={settings.setRowDensity}
          onChange={(v) => void updateSettings({ setRowDensity: v })}
        />
      </Card>
    </>
  )
}

function FeedbackSection({ settings }: { settings: AppSettings }) {
  // Same support check as useWakeLock, without engaging the lock (SPEC 12).
  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  return (
    <>
      <SectionTitle>Feedback</SectionTitle>
      <Card>
        <div className="divide-y divide-border">
          <Toggle
            label="Sound"
            hint="Rest-timer chime at countdown end"
            checked={settings.soundEnabled}
            onChange={(v) => void updateSettings({ soundEnabled: v })}
          />
          <Toggle
            label="Keep screen awake during workouts"
            hint={
              wakeLockSupported
                ? undefined
                : 'Wake Lock is not supported here — timer alerts cannot fire while the screen is off.'
            }
            checked={settings.keepScreenAwake}
            onChange={(v) => void updateSettings({ keepScreenAwake: v })}
          />
        </div>
      </Card>
    </>
  )
}

function ActivityNutritionSection({ settings }: { settings: AppSettings }) {
  const navigate = useNavigate()
  const n = settings.nutrition
  const chevron = (text: string) => (
    <span className="tabular text-[13px] whitespace-nowrap text-text-muted">{text} ›</span>
  )
  return (
    <>
      <SectionTitle>Activity & Nutrition</SectionTitle>
      <Card>
        <div className="divide-y divide-border">
          <Row
            onClick={() => navigate('/plan')}
            left={<span className="text-[15px]">Step target</span>}
            right={chevron(`${settings.stepTargetMin}–${settings.stepTargetMax}`)}
          />
          <Row
            onClick={() => navigate('/plan')}
            left={<span className="text-[15px]">Zone 2 cardio</span>}
            right={chevron(
              `${settings.weeklyZone2Target}× / week · ${settings.zone2MinutesMin}–${settings.zone2MinutesMax} min`,
            )}
          />
          <Row
            onClick={() => navigate('/plan')}
            left={<span className="text-[15px]">Calories & macros</span>}
            right={chevron(`${n.calories} kcal · P ${n.proteinG} F ${n.fatG} C ${n.carbsG}`)}
          />
          <Row
            onClick={() => navigate('/plan')}
            left={<span className="text-[15px]">Posture routine</span>}
            right={<span className="text-[14px] text-text-muted">›</span>}
          />
        </div>
        <p className="mt-1 text-[12px] text-text-muted">Edited on the Plan tab.</p>
      </Card>
    </>
  )
}

function AboutSection() {
  return (
    <>
      <SectionTitle>About</SectionTitle>
      <Card>
        <div className="divide-y divide-border">
          <Row
            left={<span className="text-[15px]">App version</span>}
            right={<span className="tabular text-[14px] text-text-muted">{APP_VERSION}</span>}
          />
          <Row
            left={<span className="text-[15px]">Database schema</span>}
            right={<span className="tabular text-[14px] text-text-muted">v{db.verno}</span>}
          />
        </div>
      </Card>
    </>
  )
}

export default function SettingsScreen() {
  // `undefined` = still loading, `null` = row genuinely missing (not seeded).
  const settings = useLiveQuery(async () => (await db.appSettings.get('settings')) ?? null, [])
  const profile = useLiveQuery(async () => (await db.userProfile.get('profile')) ?? null, [])

  if (settings === undefined || profile === undefined) {
    return (
      <div className="pt-4">
        <h1 className="mb-3 text-[22px] font-bold">Settings</h1>
        <p className="py-6 text-center text-[14px] text-text-muted">Loading…</p>
      </div>
    )
  }

  if (settings === null || profile === null) {
    return (
      <div className="pt-4">
        <h1 className="mb-3 text-[22px] font-bold">Settings</h1>
        <EmptyState
          title="Settings not initialized"
          body="The default profile has not been created yet. Reopen the app to run first-time setup; if this persists, the database may have been cleared."
        />
      </div>
    )
  }

  return (
    <div className="pt-4 pb-6">
      <h1 className="text-[22px] font-bold">Settings</h1>
      <ProfileSection profile={profile} settings={settings} />
      <TrainingSection settings={settings} />
      <DisplaySection settings={settings} />
      <FeedbackSection settings={settings} />
      <ActivityNutritionSection settings={settings} />
      <DataSection settings={settings} />
      <AboutSection />
    </div>
  )
}
