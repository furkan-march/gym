import { useEffect, useState } from 'react'
import { db } from '../../../lib/db'
import { newId, nowIso } from '../../../lib/ids'
import { deleteSet, duplicateSet, updateSet } from '../../../lib/data/workouts'
import type {
  EquipmentContext,
  Exercise,
  JointDiscomfort,
  SetLog,
} from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { Button, EmptyState } from '../../components/core'
import { Rating, Segmented } from '../../components/Segmented'
import type { FinishContext } from './helpers'

// ---------------------------------------------------------------------------
// Exercise picker (substitute + add unplanned)
// ---------------------------------------------------------------------------

export function ExercisePicker({
  exercises,
  excludeId,
  onPick,
}: {
  exercises: Exercise[]
  excludeId?: string
  onPick: (exercise: Exercise) => void
}) {
  const [q, setQ] = useState('')
  const list = exercises
    .filter(
      (e) => e.id !== excludeId && e.name.toLowerCase().includes(q.trim().toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search exercises"
        aria-label="Search exercises"
        className="mb-2 min-h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-[15px] outline-none"
      />
      <div className="max-h-[50dvh] overflow-y-auto">
        {list.length === 0 && (
          <p className="py-4 text-center text-[13px] text-text-muted">No exercises match.</p>
        )}
        {list.map((e) => (
          <button
            key={e.id}
            onClick={() => onPick(e)}
            className="flex min-h-11 w-full items-center justify-between border-b border-border/50 px-1 text-left text-[15px]"
          >
            <span>{e.name}</span>
            <span className="text-[11px] text-text-muted">
              {e.kind === 'bodyweight' ? 'bodyweight' : e.kind === 'repsOnly' ? 'reps only' : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Substitute (SPEC 11): template alternatives first, then the full library
// ---------------------------------------------------------------------------

export function SubstituteSheet({
  open,
  onClose,
  alternatives,
  allExercises,
  currentExerciseId,
  onPick,
}: {
  open: boolean
  onClose: () => void
  alternatives: Exercise[]
  allExercises: Exercise[]
  currentExerciseId: string
  onPick: (exercise: Exercise) => void
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Substitute exercise">
      <p className="mb-3 text-[13px] text-text-muted">
        Sets already logged stay attached to the original exercise.
      </p>
      {alternatives.length > 0 && (
        <>
          <div className="mb-1 text-[12px] tracking-wide text-text-muted uppercase">
            Suggested alternatives
          </div>
          <div className="mb-3 grid gap-1.5">
            {alternatives.map((a) => (
              <Button key={a.id} onClick={() => onPick(a)}>
                {a.name}
              </Button>
            ))}
          </div>
        </>
      )}
      <div className="mb-1 text-[12px] tracking-wide text-text-muted uppercase">All exercises</div>
      <ExercisePicker exercises={allExercises} excludeId={currentExerciseId} onPick={onPick} />
    </BottomSheet>
  )
}

// ---------------------------------------------------------------------------
// Exercise history (SPEC 13): last comparable sessions, concise format
// ---------------------------------------------------------------------------

export function HistorySheet({
  open,
  onClose,
  title,
  lines,
}: {
  open: boolean
  onClose: () => void
  title: string
  lines: string[]
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={`${title} — history`}>
      {lines.length === 0 ? (
        <EmptyState
          title="No comparable sessions yet"
          body="History appears once this exercise is completed with the same variant and equipment."
        />
      ) : (
        <div className="grid gap-1">
          {lines.map((l, i) => (
            <div
              key={`${i}-${l}`}
              className="tabular min-h-11 content-center border-b border-border/50 text-[14px]"
            >
              {l}
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  )
}

// ---------------------------------------------------------------------------
// Exercise note
// ---------------------------------------------------------------------------

export function NoteSheet({
  open,
  onClose,
  title,
  initial,
  onSave,
}: {
  open: boolean
  onClose: () => void
  title: string
  initial: string
  onSave: (text: string) => void
}) {
  const [text, setText] = useState(initial)
  useEffect(() => {
    if (open) setText(initial)
  }, [open, initial])
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Note"
        aria-label="Exercise note"
        className="w-full rounded-xl border border-border bg-surface-2 p-3 text-[15px] outline-none"
      />
      <Button
        variant="primary"
        className="mt-3 w-full"
        onClick={() => {
          onSave(text.trim())
          onClose()
        }}
      >
        Save note
      </Button>
    </BottomSheet>
  )
}

// ---------------------------------------------------------------------------
// Equipment context (SPEC 16): select an existing context or create one
// ---------------------------------------------------------------------------

export function contextLabel(c: EquipmentContext): string {
  return (
    [c.gym, c.machineName, c.seatSetting ? `seat ${c.seatSetting}` : null, c.note]
      .filter(Boolean)
      .join(' · ') || 'Equipment context'
  )
}

export function EquipmentSheet({
  open,
  onClose,
  contexts,
  selectedId,
  onSelect,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  contexts: EquipmentContext[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCreate: (fields: { gym?: string; machineName?: string; seatSetting?: string; note?: string }) => void
}) {
  const [gym, setGym] = useState('')
  const [machine, setMachine] = useState('')
  const [seat, setSeat] = useState('')
  const [note, setNote] = useState('')
  const canCreate = Boolean(gym.trim() || machine.trim() || seat.trim() || note.trim())
  const field = (
    value: string,
    set: (v: string) => void,
    placeholder: string,
  ) => (
    <input
      value={value}
      onChange={(e) => set(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="min-h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-[14px] outline-none"
    />
  )
  return (
    <BottomSheet open={open} onClose={onClose} title="Equipment context">
      <p className="mb-3 text-[13px] text-text-muted">
        Progression only compares sessions on matching equipment. Machine loads are not comparable
        across different machines.
      </p>
      <div className="grid gap-1.5">
        <Button
          className={selectedId == null ? 'border-accent text-accent' : ''}
          onClick={() => {
            onSelect(null)
            onClose()
          }}
        >
          No specific context
        </Button>
        {contexts.map((c) => (
          <Button
            key={c.id}
            className={selectedId === c.id ? 'border-accent text-accent' : ''}
            onClick={() => {
              onSelect(c.id)
              onClose()
            }}
          >
            {contextLabel(c)}
          </Button>
        ))}
      </div>
      <div className="mt-4 mb-1 text-[12px] tracking-wide text-text-muted uppercase">
        New context
      </div>
      <div className="grid gap-1.5">
        {field(gym, setGym, 'Gym')}
        {field(machine, setMachine, 'Machine name')}
        {field(seat, setSeat, 'Seat setting')}
        {field(note, setNote, 'Other equipment note')}
        <Button
          variant="primary"
          disabled={!canCreate}
          onClick={() => {
            onCreate({
              gym: gym.trim() || undefined,
              machineName: machine.trim() || undefined,
              seatSetting: seat.trim() || undefined,
              note: note.trim() || undefined,
            })
            setGym('')
            setMachine('')
            setSeat('')
            setNote('')
            onClose()
          }}
        >
          Create and select
        </Button>
      </div>
    </BottomSheet>
  )
}

// ---------------------------------------------------------------------------
// Per-set overflow menu (SPEC 11): duplicate, copy previous, delete,
// pain / poor-form exception flags, note
// ---------------------------------------------------------------------------

export function RowMenuSheet({
  set,
  prevSet,
  onClose,
}: {
  set: SetLog | null
  prevSet: SetLog | null
  onClose: () => void
}) {
  const [note, setNote] = useState('')
  useEffect(() => {
    setNote(set?.notes ?? '')
  }, [set?.id, set?.notes])
  if (!set) return null

  const copyPrev = async () => {
    if (!prevSet) return
    await updateSet(set.id, {
      loadKg: prevSet.loadKg,
      reps: prevSet.reps,
      rir: prevSet.rir,
      bodyweightMode: prevSet.bodyweightMode,
      addedWeightKg: prevSet.addedWeightKg,
      assistanceWeightKg: prevSet.assistanceWeightKg,
    })
    onClose()
  }

  return (
    <BottomSheet open onClose={onClose} title="Set options">
      <div className="grid gap-1.5">
        <Button
          onClick={() => {
            void duplicateSet(set.id)
            onClose()
          }}
        >
          Duplicate set
        </Button>
        <Button disabled={!prevSet} onClick={() => void copyPrev()}>
          Copy previous set
        </Button>
        <Button
          className={set.painFlag ? 'border-warning text-warning' : ''}
          onClick={() => void updateSet(set.id, { painFlag: !set.painFlag })}
        >
          {set.painFlag ? 'Remove pain flag' : 'Flag pain on this set'}
        </Button>
        <Button
          className={set.formQuality === 'poor' ? 'border-warning text-warning' : ''}
          onClick={() =>
            void updateSet(set.id, { formQuality: set.formQuality === 'poor' ? null : 'poor' })
          }
        >
          {set.formQuality === 'poor' ? 'Remove poor-form flag' : 'Flag poor form'}
        </Button>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Set note"
          aria-label="Set note"
          className="w-full rounded-xl border border-border bg-surface-2 p-3 text-[14px] outline-none"
        />
        <div className="flex gap-1.5">
          <Button
            className="flex-1"
            onClick={() => {
              void updateSet(set.id, { notes: note.trim() || undefined })
              onClose()
            }}
          >
            Save note
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => {
              void deleteSet(set.id)
              onClose()
            }}
          >
            Delete set
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}

// ---------------------------------------------------------------------------
// Session feedback after Finish (SPEC 17), with subtle new-record lines
// (SPEC 21 — no confetti)
// ---------------------------------------------------------------------------

export function FinishSheet({ ctx, onDone }: { ctx: FinishContext; onDone: () => void }) {
  const [difficulty, setDifficulty] = useState<number | null>(null)
  const [discomfort, setDiscomfort] = useState<JointDiscomfort | null>(null)
  const [knee, setKnee] = useState<number | null>(null)
  const [note, setNote] = useState('')

  const save = async () => {
    const t = nowIso()
    await db.sessionFeedbacks.add({
      id: newId(),
      workoutSessionId: ctx.workoutSessionId,
      difficulty,
      jointDiscomfort: discomfort,
      kneeComfortAfter: ctx.templateKind === 'lower' ? knee : null,
      note: note.trim() || undefined,
      createdAt: t,
      updatedAt: t,
    })
    onDone()
  }

  return (
    <BottomSheet open onClose={onDone} title="Workout finished">
      {ctx.prLines.length > 0 && (
        <div className="mb-3 grid gap-0.5">
          {ctx.prLines.map((l) => (
            <div key={l} className="text-[13px] text-accent">
              New record · {l}
            </div>
          ))}
        </div>
      )}
      <Rating label="Session difficulty" value={difficulty} onChange={setDifficulty} />
      <div className="mt-2">
        <Segmented<JointDiscomfort>
          label="Joint discomfort"
          value={discomfort}
          onChange={setDiscomfort}
          options={[
            { value: 'none', label: 'None' },
            { value: 'mild', label: 'Mild' },
            { value: 'moderate', label: 'Moderate' },
            { value: 'severe', label: 'Severe' },
          ]}
        />
      </div>
      {(discomfort === 'moderate' || discomfort === 'severe') && (
        <p className="mt-2 text-[13px] text-text-muted">
          Consider reviewing range of motion, load, technique, or exercise choice. No progression
          will be suggested from this session.
        </p>
      )}
      {ctx.templateKind === 'lower' && (
        <div className="mt-2">
          <Rating label="Knee comfort" value={knee} onChange={setKnee} />
        </div>
      )}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Session note (optional)"
        aria-label="Session note"
        className="mt-3 w-full rounded-xl border border-border bg-surface-2 p-3 text-[14px] outline-none"
      />
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={onDone}>
          Skip
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => void save()}>
          Save feedback
        </Button>
      </div>
    </BottomSheet>
  )
}
