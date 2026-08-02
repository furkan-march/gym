import { useState } from 'react'
import { Segmented } from '../components/Segmented'
import { useSettings } from '../hooks/useSettings'
import { BodyTab } from './history/BodyTab'
import { CardioTab } from './history/CardioTab'
import { CheckInsTab } from './history/CheckInsTab'
import { PostureTab } from './history/PostureTab'
import { WorkoutsTab } from './history/WorkoutsTab'

/**
 * History screen (SPEC 26): chronological logs of workouts, cardio, body
 * metrics, posture days and weekly check-ins. Demo rows are hidden unless
 * demo mode is enabled (SPEC 34). No calendar view in V1.
 */

type HistoryTab = 'workouts' | 'cardio' | 'body' | 'posture' | 'checkins'

const TAB_OPTIONS: { value: HistoryTab; label: string }[] = [
  { value: 'workouts', label: 'Workouts' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'body', label: 'Body' },
  { value: 'posture', label: 'Posture' },
  { value: 'checkins', label: 'Check-ins' },
]

export default function HistoryScreen() {
  const [tab, setTab] = useState<HistoryTab>('workouts')
  const settings = useSettings()

  return (
    <div className="pt-4">
      <h1 className="mb-3 text-[22px] font-bold">History</h1>
      <Segmented options={TAB_OPTIONS} value={tab} onChange={setTab} />
      <div className="mt-4 pb-4">
        {settings === undefined ? (
          <p className="py-6 text-center text-[14px] text-text-muted">Loading…</p>
        ) : (
          <HistoryTabBody tab={tab} includeDemo={settings.demoDataEnabled === true} />
        )}
      </div>
    </div>
  )
}

function HistoryTabBody({ tab, includeDemo }: { tab: HistoryTab; includeDemo: boolean }) {
  switch (tab) {
    case 'workouts':
      return <WorkoutsTab includeDemo={includeDemo} />
    case 'cardio':
      return <CardioTab includeDemo={includeDemo} />
    case 'body':
      return <BodyTab includeDemo={includeDemo} />
    case 'posture':
      return <PostureTab includeDemo={includeDemo} />
    case 'checkins':
      return <CheckInsTab includeDemo={includeDemo} />
  }
}
