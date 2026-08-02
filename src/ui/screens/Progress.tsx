import { toDateKey } from '../../lib/dates'
import type { AppSettings, UserProfile } from '../../lib/types'
import { SectionTitle } from '../components/core'
import { useNow } from '../hooks/useNow'
import { useProfile, useSettings } from '../hooks/useSettings'
import { CardioChart, StepsChart } from './progress/ActivityCharts'
import { LiftingAdherenceChart, PostureAdherenceChart } from './progress/AdherenceCharts'
import { BodyWeightChart, WaistChart } from './progress/BodyCharts'
import { BodyFatChart } from './progress/BodyFatChart'
import { CheckInSection } from './progress/CheckInSection'
import { RecordsSection } from './progress/RecordsSection'
import { StallSection } from './progress/StallSection'
import { StatTiles } from './progress/StatTiles'
import { E1rmChart, VolumeChart } from './progress/StrengthCharts'

/**
 * Progress screen (SPEC 19/20/21/22/24, 39 item 5): weekly check-in entry
 * point, stat tiles, separate responsive charts, personal records and
 * progression status. The V1 stat tiles stay; V2 adds a body-fat trend chart
 * and weekly lifting/posture adherence charts under Consistency. Every chart
 * has a useful empty state (SPEC 33). Demo rows are excluded unless demo mode
 * is enabled (SPEC 34).
 */
export default function ProgressScreen() {
  const settings = useSettings()
  const profile = useProfile()
  const now = useNow(60_000)

  if (settings === undefined || profile === undefined) {
    return (
      <div className="pt-4">
        <h1 className="mb-3 text-[22px] font-bold">Progress</h1>
        <p className="py-6 text-center text-[14px] text-text-muted">Loading…</p>
      </div>
    )
  }

  return <ProgressBody settings={settings} profile={profile} todayKey={toDateKey(now)} />
}

function ProgressBody({
  settings,
  profile,
  todayKey,
}: {
  settings: AppSettings
  profile: UserProfile
  todayKey: string
}) {
  const includeDemo = settings.demoDataEnabled === true

  return (
    <div className="pt-4 pb-4">
      <h1 className="mb-3 text-[22px] font-bold">Progress</h1>

      <CheckInSection settings={settings} profile={profile} todayKey={todayKey} />

      <StatTiles settings={settings} profile={profile} todayKey={todayKey} />

      <SectionTitle>Body</SectionTitle>
      <BodyWeightChart includeDemo={includeDemo} />
      <WaistChart includeDemo={includeDemo} />
      <BodyFatChart includeDemo={includeDemo} />

      <SectionTitle>Strength</SectionTitle>
      <E1rmChart includeDemo={includeDemo} />
      <VolumeChart includeDemo={includeDemo} weekStartsOn={settings.weekStartsOn} />

      <SectionTitle>Activity</SectionTitle>
      <StepsChart
        includeDemo={includeDemo}
        stepTargetMin={settings.stepTargetMin}
        todayKey={todayKey}
      />
      <CardioChart includeDemo={includeDemo} weekStartsOn={settings.weekStartsOn} />

      <SectionTitle>Consistency</SectionTitle>
      <LiftingAdherenceChart
        includeDemo={includeDemo}
        weekStartsOn={settings.weekStartsOn}
        programStart={profile.programStartDateKey}
        todayKey={todayKey}
      />
      <PostureAdherenceChart
        includeDemo={includeDemo}
        weekStartsOn={settings.weekStartsOn}
        programStart={profile.programStartDateKey}
        todayKey={todayKey}
      />

      <RecordsSection includeDemo={includeDemo} />

      <StallSection includeDemo={includeDemo} />
    </div>
  )
}
