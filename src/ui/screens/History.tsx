import { useState } from 'react'
import { Segmented } from '../components/Segmented'
import { useSettings } from '../hooks/useSettings'
import type { Weekday } from '../../lib/types'
import { BodyTab } from './history/BodyTab'
import { CalendarTab } from './history/CalendarTab'
import { CardioTab } from './history/CardioTab'
import { CheckInsTab } from './history/CheckInsTab'
import { PostureTab } from './history/PostureTab'
import { WorkoutsTab } from './history/WorkoutsTab'

/**
 * History screen (SPEC 26): chronological logs of workouts, cardio, body
 * metrics, posture days and weekly check-ins, plus the V2 month-calendar view
 * (SPEC 39 item 1). Demo rows are hidden unless demo mode is enabled (SPEC 34).
 * Six tabs no longer fit a 375px viewport, so the segmented row scrolls
 * horizontally at a fixed readable width.
 */

type HistoryTab = 'workouts' | 'cardio' | 'body' | 'posture' | 'checkins' | 'calendar'

const TAB_OPTIONS: { value: HistoryTab; label: string }[] = [
  { value: 'workouts', label: 'Workouts' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'body', label: 'Body' },
  { value: 'posture', label: 'Posture' },
  { value: 'checkins', label: 'Check-ins' },
  { value: 'calendar', label: 'Calendar' },
]

export default function HistoryScreen() {
  const [tab, setTab] = useState<HistoryTab>('workouts')
  const settings = useSettings()

  return (
    <div className="pt-4">
      <h1 className="mb-3 text-[22px] font-bold">History</h1>
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="min-w-[500px]">
          <Segmented options={TAB_OPTIONS} value={tab} onChange={setTab} />
        </div>
      </div>
      <div className="mt-4 pb-4">
        {settings === undefined ? (
          <p className="py-6 text-center text-[14px] text-text-muted">Loading…</p>
        ) : (
          <HistoryTabBody
            tab={tab}
            includeDemo={settings.demoDataEnabled === true}
            weekStartsOn={settings.weekStartsOn}
          />
        )}
      </div>
    </div>
  )
}

function HistoryTabBody({
  tab,
  includeDemo,
  weekStartsOn,
}: {
  tab: HistoryTab
  includeDemo: boolean
  weekStartsOn: Weekday
}) {
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
    case 'calendar':
      return <CalendarTab includeDemo={includeDemo} weekStartsOn={weekStartsOn} />
  }
}
