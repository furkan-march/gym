import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AppSettings } from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { Segmented } from '../../components/Segmented'
import { Button, Card, Row, SectionTitle } from '../../components/core'
import { updateSettings } from '../../hooks/useSettings'
import { Toggle } from './Toggle'

/**
 * TRAINING section (SPEC 28): week start, timer/visibility toggles and the
 * default equipment note. Workout days and per-exercise defaults (increments,
 * sets, rep ranges) are edited on the Plan tab, so this section links there.
 */
export function TrainingSection({ settings }: { settings: AppSettings }) {
  const navigate = useNavigate()
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')

  const openNote = () => {
    setNoteDraft(settings.defaultEquipmentNote)
    setNoteOpen(true)
  }
  const saveNote = async () => {
    await updateSettings({ defaultEquipmentNote: noteDraft.trim() })
    setNoteOpen(false)
  }

  return (
    <>
      <SectionTitle>Training</SectionTitle>
      <Card>
        <Segmented
          label="Week starts on"
          options={[
            { value: 'mon', label: 'Monday' },
            { value: 'sun', label: 'Sunday' },
          ]}
          value={settings.weekStartsOn === 0 ? 'sun' : 'mon'}
          onChange={(v) => void updateSettings({ weekStartsOn: v === 'sun' ? 0 : 1 })}
        />
        <div className="mt-2 divide-y divide-border">
          <Row
            onClick={() => navigate('/plan')}
            left={
              <>
                <span className="block text-[15px]">Workout days & default increments</span>
                <span className="text-[12px] text-text-muted">
                  Edited per day and per exercise on the Plan tab
                </span>
              </>
            }
            right={<span className="text-[14px] text-text-muted">›</span>}
          />
          <Toggle
            label="Auto-start rest timer"
            hint="Starts the timer when a working set is marked done"
            checked={settings.autoStartRestTimer}
            onChange={(v) => void updateSettings({ autoStartRestTimer: v })}
          />
          <Toggle
            label="Warm-up set timers"
            hint="Rest timer also runs after warm-up sets"
            checked={settings.warmupTimersEnabled}
            onChange={(v) => void updateSettings({ warmupTimersEnabled: v })}
          />
          <Toggle
            label="Show RIR"
            hint="Reps-in-reserve column while logging"
            checked={settings.rirVisible}
            onChange={(v) => void updateSettings({ rirVisible: v })}
          />
          <Toggle
            label="Show warm-up checklist"
            checked={settings.warmupsVisible}
            onChange={(v) => void updateSettings({ warmupsVisible: v })}
          />
          <Toggle
            label="Ramp-up sets"
            hint="Build-up sets before the first compound lift"
            checked={settings.rampSetsEnabled}
            onChange={(v) => void updateSettings({ rampSetsEnabled: v })}
          />
          <Toggle
            label="Superset suggestions"
            hint="Pairs accessories that share a superset group"
            checked={settings.supersetSuggestionsEnabled}
            onChange={(v) => void updateSettings({ supersetSuggestionsEnabled: v })}
          />
          <Row
            onClick={openNote}
            left={<span className="text-[15px]">Default equipment note</span>}
            right={
              <span className="max-w-[45%] truncate text-[14px] text-text-muted">
                {settings.defaultEquipmentNote.length > 0 ? settings.defaultEquipmentNote : 'None'}{' '}
                ›
              </span>
            }
          />
        </div>
      </Card>

      <BottomSheet open={noteOpen} onClose={() => setNoteOpen(false)} title="Default equipment note">
        <input
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="e.g. Main Gym, third floor"
          aria-label="Default equipment note"
          className="min-h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-[15px] outline-none"
        />
        <p className="mt-2 text-[12px] text-text-muted">
          Shown as the starting point when logging machine settings.
        </p>
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={() => setNoteOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" className="flex-1" onClick={() => void saveNote()}>
            Save
          </Button>
        </div>
      </BottomSheet>
    </>
  )
}
