import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { toDateKey, formatShort } from '../../../lib/dates'
import {
  exportBackup,
  importBackup,
  previewBackup,
  type BackupPreview,
} from '../../../lib/backup/backup'
import {
  bodyMetricsCsv,
  cardioSessionsCsv,
  dailyStepsCsv,
  exerciseHistoryCsv,
  workoutHistoryCsv,
} from '../../../lib/backup/csv'
import {
  backupReminderDue,
  exportFile,
  markBackupDone,
  requestPersistence,
  type ExportOutcome,
  type PersistenceStatus,
} from '../../../lib/backup/share'
import { rebuildPersonalRecords } from '../../../lib/engines/records'
import { clearDemoData, loadDemoData } from '../../../lib/seed/demo'
import type { AppSettings } from '../../../lib/types'
import { BottomSheet } from '../../components/BottomSheet'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Button, Card, Row, SectionTitle } from '../../components/core'
import { updateSettings } from '../../hooks/useSettings'
import { restoreDefaultProgram } from '../plan/restoreDefaults'
import { fmtMb, humanTableName } from './format'

/**
 * DATA section (SPEC 28/30/33/34): backup export/import, CSV export, storage
 * persistence status, backup reminder, demo data, reset program and the
 * delete-everything escape hatch.
 */

const STORAGE_WARNING =
  'Deleting the home-screen app, clearing Safari website data, or restoring the phone destroys all local data — export a backup first.'

const RESET_PROGRAM_BODY =
  'This restores the default workout templates (Upper A, Upper B, Lower/Legs), the weekly schedule (Upper A on Tuesday, Upper B on Thursday, Legs on Sunday), and the per-exercise defaults: sets, rep ranges, RIR, increments and rest times. Workout history, body metrics, activity, posture and nutrition logs, custom templates, and all other settings are never changed.'

const BACKUP_OUTCOME_TEXT: Record<Exclude<ExportOutcome, 'failed'>, string> = {
  shared: 'Backup saved via the share sheet.',
  downloaded: 'Backup downloaded.',
  clipboard: 'Backup JSON copied to the clipboard — paste it into a file to keep it.',
}

const CSV_OUTCOME_TEXT: Record<Exclude<ExportOutcome, 'failed'>, string> = {
  shared: 'CSV saved via the share sheet.',
  downloaded: 'CSV downloaded.',
  clipboard: 'CSV copied to the clipboard — paste it into a file to keep it.',
}

type CsvBusy = 'csv' | 'bodyCsv' | 'stepsCsv' | 'cardioCsv' | 'exerciseCsv'

type Busy = 'backup' | CsvBusy | 'import' | 'demo' | 'reset' | null

/** Rows kept unless demo data is deliberately included. */
type DemoFilter = <T extends { isDemo?: boolean }>(rows: T[]) => T[]

type CsvResult = { kind: 'csv'; filename: string; csv: string } | { kind: 'empty'; text: string }

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function DataSection({ settings }: { settings: AppSettings }) {
  const [busy, setBusy] = useState<Busy>(null)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [persistence, setPersistence] = useState<PersistenceStatus | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingRaw, setPendingRaw] = useState<string | null>(null)
  const [preview, setPreview] = useState<Extract<BackupPreview, { ok: true }> | null>(null)
  const [confirmImport, setConfirmImport] = useState(false)
  const [confirmDemo, setConfirmDemo] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteText, setDeleteText] = useState('')

  // SPEC 30: request persistent storage when this section mounts.
  useEffect(() => {
    let live = true
    void requestPersistence().then((p) => {
      if (live) setPersistence(p)
    })
    return () => {
      live = false
    }
  }, [])

  // Completed real (non-demo) sessions not covered by the last backup.
  const sessionsSinceBackup = useLiveQuery(async () => {
    const all = await db.workoutSessions.toArray()
    return all.filter(
      (s) =>
        s.status === 'completed' &&
        s.isDemo !== true &&
        (settings.lastBackupAt == null ||
          (s.updatedAt ?? s.createdAt) > settings.lastBackupAt),
    ).length
  }, [settings.lastBackupAt])

  // Any real (non-demo) sessions at all — gates the demo-data warning.
  const realSessionCount = useLiveQuery(async () => {
    const all = await db.workoutSessions.toArray()
    return all.filter((s) => s.isDemo !== true).length
  }, [])

  const reminderDue =
    sessionsSinceBackup !== undefined && backupReminderDue(settings, sessionsSinceBackup)

  // --- export -------------------------------------------------------------

  const runExportBackup = async () => {
    setBusy('backup')
    setStatus(null)
    try {
      const backup = await exportBackup(db)
      const outcome = await exportFile(
        `gym-backup-${toDateKey(new Date())}.json`,
        'application/json',
        JSON.stringify(backup),
      )
      if (outcome === 'failed') {
        setStatus({ kind: 'error', text: 'Export did not complete — no backup was saved.' })
      } else {
        await markBackupDone(db)
        setStatus({ kind: 'ok', text: BACKUP_OUTCOME_TEXT[outcome] })
      }
    } catch (err) {
      setStatus({ kind: 'error', text: `Backup export failed: ${errText(err)}` })
    } finally {
      setBusy(null)
    }
  }

  // Shared flow for all CSV exports (SPEC 30 + V2 item 3): demo filtering,
  // empty-data message, share-sheet export and outcome reporting.
  const runCsvFlow = async (key: CsvBusy, produce: (keep: DemoFilter) => Promise<CsvResult>) => {
    setBusy(key)
    setStatus(null)
    try {
      const includeDemo = settings.demoDataEnabled === true
      const keep: DemoFilter = (rows) =>
        includeDemo ? rows : rows.filter((r) => r.isDemo !== true)
      const result = await produce(keep)
      if (result.kind === 'empty') {
        setStatus({ kind: 'ok', text: result.text })
        return
      }
      const outcome = await exportFile(result.filename, 'text/csv', result.csv)
      if (outcome === 'failed') {
        setStatus({ kind: 'error', text: 'Export did not complete — no CSV was saved.' })
      } else {
        setStatus({ kind: 'ok', text: CSV_OUTCOME_TEXT[outcome] })
      }
    } catch (err) {
      setStatus({ kind: 'error', text: `CSV export failed: ${errText(err)}` })
    } finally {
      setBusy(null)
    }
  }

  const runExportCsv = () =>
    runCsvFlow('csv', async (keep) => {
      const [sessions, exerciseSessions, sets] = await Promise.all([
        db.workoutSessions.toArray(),
        db.exerciseSessions.toArray(),
        db.setLogs.toArray(),
      ])
      const completed = keep(sessions).filter((s) => s.status === 'completed')
      if (completed.length === 0) {
        return { kind: 'empty', text: 'No completed workouts yet — nothing to export.' }
      }
      return {
        kind: 'csv',
        filename: `gym-workouts-${toDateKey(new Date())}.csv`,
        csv: workoutHistoryCsv(completed, keep(exerciseSessions), keep(sets)),
      }
    })

  const runExportBodyMetricsCsv = () =>
    runCsvFlow('bodyCsv', async (keep) => {
      const metrics = keep(await db.bodyMetrics.toArray())
      if (metrics.length === 0) {
        return { kind: 'empty', text: 'No body metrics yet — nothing to export.' }
      }
      return {
        kind: 'csv',
        filename: `gym-body-metrics-${toDateKey(new Date())}.csv`,
        csv: bodyMetricsCsv(metrics),
      }
    })

  const runExportStepsCsv = () =>
    runCsvFlow('stepsCsv', async (keep) => {
      const activities = keep(await db.dailyActivities.toArray())
      if (!activities.some((a) => a.steps != null)) {
        return { kind: 'empty', text: 'No step counts yet — nothing to export.' }
      }
      return {
        kind: 'csv',
        filename: `gym-steps-${toDateKey(new Date())}.csv`,
        csv: dailyStepsCsv(activities),
      }
    })

  const runExportCardioCsv = () =>
    runCsvFlow('cardioCsv', async (keep) => {
      const cardio = keep(await db.cardioSessions.toArray())
      if (cardio.length === 0) {
        return { kind: 'empty', text: 'No cardio sessions yet — nothing to export.' }
      }
      return {
        kind: 'csv',
        filename: `gym-cardio-${toDateKey(new Date())}.csv`,
        csv: cardioSessionsCsv(cardio),
      }
    })

  const runExportExerciseHistoryCsv = () =>
    runCsvFlow('exerciseCsv', async (keep) => {
      const [sessions, exerciseSessions, sets] = await Promise.all([
        db.workoutSessions.toArray(),
        db.exerciseSessions.toArray(),
        db.setLogs.toArray(),
      ])
      const completed = keep(sessions).filter((s) => s.status === 'completed')
      if (completed.length === 0) {
        return { kind: 'empty', text: 'No completed workouts yet — nothing to export.' }
      }
      return {
        kind: 'csv',
        filename: `gym-exercise-history-${toDateKey(new Date())}.csv`,
        csv: exerciseHistoryCsv(keep(exerciseSessions), keep(sets), completed),
      }
    })

  // --- import (SPEC 30 replace strategy, SPEC 33 error states) ------------

  const onFileChosen = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setStatus(null)
    let raw: string
    try {
      raw = await file.text()
    } catch {
      setStatus({
        kind: 'error',
        text: 'The selected file could not be read — the import was not started. Try selecting the file again.',
      })
      return
    }
    const p = previewBackup(raw)
    if (!p.ok) {
      setStatus({ kind: 'error', text: p.error })
      return
    }
    setPendingRaw(raw)
    setPreview(p)
  }

  const cancelImport = () => {
    setPreview(null)
    setPendingRaw(null)
    setConfirmImport(false)
  }

  const runImport = async () => {
    const raw = pendingRaw
    setConfirmImport(false)
    setPreview(null)
    setPendingRaw(null)
    if (raw == null) return
    setBusy('import')
    setStatus(null)
    try {
      const result = await importBackup(db, raw, rebuildPersonalRecords)
      if (!result.ok) {
        setStatus({ kind: 'error', text: result.error })
      } else {
        const total = Object.values(result.counts).reduce((a, b) => a + b, 0)
        setStatus({ kind: 'ok', text: `Backup imported — ${total} records restored.` })
      }
    } catch (err) {
      setStatus({ kind: 'error', text: `Import failed: ${errText(err)}` })
    } finally {
      setBusy(null)
    }
  }

  // --- demo data (SPEC 34) ------------------------------------------------

  const demoRowsVisible = import.meta.env.DEV || settings.demoDataEnabled === true

  const doLoadDemo = async () => {
    setConfirmDemo(false)
    setBusy('demo')
    setStatus(null)
    try {
      await loadDemoData(db, toDateKey(new Date()))
      await updateSettings({ demoDataEnabled: true })
      await rebuildPersonalRecords(db)
      setStatus({ kind: 'ok', text: 'Demo data loaded.' })
    } catch (err) {
      setStatus({ kind: 'error', text: `Loading demo data failed: ${errText(err)}` })
    } finally {
      setBusy(null)
    }
  }

  const onLoadDemoClick = () => {
    if ((realSessionCount ?? 0) > 0) setConfirmDemo(true)
    else void doLoadDemo()
  }

  const doClearDemo = async () => {
    setBusy('demo')
    setStatus(null)
    try {
      await clearDemoData(db)
      await updateSettings({ demoDataEnabled: false })
      await rebuildPersonalRecords(db)
      setStatus({ kind: 'ok', text: 'Demo data cleared.' })
    } catch (err) {
      setStatus({ kind: 'error', text: `Clearing demo data failed: ${errText(err)}` })
    } finally {
      setBusy(null)
    }
  }

  // --- reset program / delete all ----------------------------------------

  const doResetProgram = async () => {
    setConfirmReset(false)
    setBusy('reset')
    setStatus(null)
    try {
      await restoreDefaultProgram()
      setStatus({ kind: 'ok', text: 'Default program restored.' })
    } catch (err) {
      setStatus({ kind: 'error', text: `Reset failed: ${errText(err)}` })
    } finally {
      setBusy(null)
    }
  }

  const deleteConfirmed = deleteText.trim().toLowerCase() === 'delete'
  const doDeleteAll = async () => {
    if (!deleteConfirmed) return
    try {
      await db.delete()
    } catch (err) {
      setDeleteOpen(false)
      setStatus({ kind: 'error', text: `Deleting the database failed: ${errText(err)}` })
      return
    }
    window.location.reload()
  }

  const lastBackupLabel =
    settings.lastBackupAt != null
      ? formatShort(toDateKey(new Date(settings.lastBackupAt)))
      : 'Never'

  const storageUsage =
    persistence == null
      ? '…'
      : persistence.usage != null
        ? persistence.quota != null
          ? `${fmtMb(persistence.usage)} of ${fmtMb(persistence.quota)}`
          : fmtMb(persistence.usage)
        : 'Unknown'

  return (
    <>
      <SectionTitle>Data</SectionTitle>

      {reminderDue ? (
        <div className="mb-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-[13px]">
          <span className="tabular">{sessionsSinceBackup}</span>
          {settings.lastBackupAt == null
            ? ' logged workouts are not in any backup yet — export one when convenient.'
            : ' workouts logged since your last backup — export a fresh one when convenient.'}
        </div>
      ) : null}

      {status ? (
        <Card className={`mb-2 ${status.kind === 'error' ? 'border-danger/40' : ''}`}>
          <p className={`text-[13px] ${status.kind === 'error' ? 'text-danger' : 'text-text-muted'}`}>
            {status.text}
          </p>
        </Card>
      ) : null}

      <Card>
        <div className="divide-y divide-border">
          <Row
            onClick={() => void runExportBackup()}
            left={
              <>
                <span className="block text-[15px]">Export full backup</span>
                <span className="text-[12px] text-text-muted">JSON file with all data</span>
              </>
            }
            right={
              <span className="text-[14px] text-text-muted">{busy === 'backup' ? '…' : '›'}</span>
            }
          />
          <Row
            onClick={() => fileInputRef.current?.click()}
            left={
              <>
                <span className="block text-[15px]">Import backup</span>
                <span className="text-[12px] text-text-muted">Replaces all current data</span>
              </>
            }
            right={
              <span className="text-[14px] text-text-muted">{busy === 'import' ? '…' : '›'}</span>
            }
          />
          <Row
            onClick={() => void runExportCsv()}
            left={<span className="text-[15px]">Export workout CSV</span>}
            right={<span className="text-[14px] text-text-muted">{busy === 'csv' ? '…' : '›'}</span>}
          />
          <Row
            onClick={() => void runExportBodyMetricsCsv()}
            left={<span className="text-[15px]">Body metrics CSV</span>}
            right={
              <span className="text-[14px] text-text-muted">{busy === 'bodyCsv' ? '…' : '›'}</span>
            }
          />
          <Row
            onClick={() => void runExportStepsCsv()}
            left={<span className="text-[15px]">Steps CSV</span>}
            right={
              <span className="text-[14px] text-text-muted">{busy === 'stepsCsv' ? '…' : '›'}</span>
            }
          />
          <Row
            onClick={() => void runExportCardioCsv()}
            left={<span className="text-[15px]">Cardio CSV</span>}
            right={
              <span className="text-[14px] text-text-muted">{busy === 'cardioCsv' ? '…' : '›'}</span>
            }
          />
          <Row
            onClick={() => void runExportExerciseHistoryCsv()}
            left={<span className="text-[15px]">Exercise history CSV</span>}
            right={
              <span className="text-[14px] text-text-muted">
                {busy === 'exerciseCsv' ? '…' : '›'}
              </span>
            }
          />
          <Row
            left={<span className="text-[15px]">Last backup</span>}
            right={<span className="tabular text-[14px] text-text-muted">{lastBackupLabel}</span>}
          />
          <Row
            left={<span className="text-[15px]">Persistent storage</span>}
            right={
              <span className="text-[14px] text-text-muted">
                {persistence == null ? '…' : persistence.persisted ? 'Granted' : 'Not granted'}
              </span>
            }
          />
          <Row
            left={<span className="text-[15px]">Storage used</span>}
            right={<span className="tabular text-[14px] text-text-muted">{storageUsage}</span>}
          />
          {demoRowsVisible && import.meta.env.DEV ? (
            <Row
              onClick={() => {
                if (busy == null) onLoadDemoClick()
              }}
              left={
                <>
                  <span className="block text-[15px]">Load demo data</span>
                  <span className="text-[12px] text-text-muted">
                    Four weeks of example history (development only)
                  </span>
                </>
              }
              right={
                <span className="text-[14px] text-text-muted">{busy === 'demo' ? '…' : '›'}</span>
              }
            />
          ) : null}
          {demoRowsVisible && settings.demoDataEnabled ? (
            <Row
              onClick={() => {
                if (busy == null) void doClearDemo()
              }}
              left={
                <>
                  <span className="block text-[15px]">Clear demo data</span>
                  <span className="text-[12px] text-text-muted">
                    Removes demo records only — your own logs stay
                  </span>
                </>
              }
              right={
                <span className="text-[14px] text-text-muted">{busy === 'demo' ? '…' : '›'}</span>
              }
            />
          ) : null}
          <Row
            onClick={() => setConfirmReset(true)}
            left={
              <>
                <span className="block text-[15px]">Reset program</span>
                <span className="text-[12px] text-text-muted">
                  Templates, schedule and exercise defaults — never history
                </span>
              </>
            }
            right={
              <span className="text-[14px] text-text-muted">{busy === 'reset' ? '…' : '›'}</span>
            }
          />
          <Row
            onClick={() => {
              setDeleteText('')
              setDeleteOpen(true)
            }}
            left={<span className="text-[15px] text-danger">Delete all data</span>}
            right={<span className="text-[14px] text-text-muted">›</span>}
          />
        </div>
        <p className="mt-3 text-[12px] text-text-muted">{STORAGE_WARNING}</p>
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        aria-label="Choose backup file"
        onChange={(e) => void onFileChosen(e)}
      />

      {/* Import preview (SPEC 30: preview + confirmation before overwrite) */}
      <BottomSheet open={preview != null} onClose={cancelImport} title="Import backup">
        {preview ? (
          <>
            <p className="text-[13px] text-text-muted">
              Exported {new Date(preview.exportedAt).toLocaleString()} · app v{preview.appVersion}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1">
              {preview.summary.map((s) => (
                <div key={s.table} className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] text-text-muted">
                    {humanTableName(s.table)}
                  </span>
                  <span className="tabular text-[13px]">{s.count}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[13px] font-medium text-warning">
              This REPLACES all current data on this device.
            </p>
            <div className="mt-4 flex gap-2">
              <Button className="flex-1" onClick={cancelImport}>
                Cancel
              </Button>
              <Button variant="danger" className="flex-1" onClick={() => setConfirmImport(true)}>
                Import…
              </Button>
            </div>
          </>
        ) : null}
      </BottomSheet>

      <ConfirmDialog
        open={confirmImport}
        title="Replace all data?"
        body="Everything currently stored on this device will be replaced by the backup's contents. This cannot be undone."
        confirmLabel="Replace and import"
        danger
        onConfirm={() => void runImport()}
        onCancel={() => setConfirmImport(false)}
      />

      <ConfirmDialog
        open={confirmDemo}
        title="Load demo data?"
        body="You already have real workout data. Demo records will appear alongside it in history, records and progression until you clear them."
        confirmLabel="Load demo data"
        onConfirm={() => void doLoadDemo()}
        onCancel={() => setConfirmDemo(false)}
      />

      <ConfirmDialog
        open={confirmReset}
        title="Reset program?"
        body={RESET_PROGRAM_BODY}
        confirmLabel="Reset program"
        danger
        onConfirm={() => void doResetProgram()}
        onCancel={() => setConfirmReset(false)}
      />

      {/* Delete everything: type-to-confirm double confirmation (SPEC 28) */}
      <BottomSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete all data">
        <p className="text-[14px] text-text-muted">
          This permanently deletes everything stored on this device: workout history, body
          metrics, activity, posture and nutrition logs, templates and settings. It cannot be
          undone. Export a backup first if you want to keep anything.
        </p>
        <label className="mt-4 block text-[13px] text-text-muted" htmlFor="delete-confirm-input">
          Type <span className="font-semibold text-text">delete</span> to confirm
        </label>
        <input
          id="delete-confirm-input"
          value={deleteText}
          onChange={(e) => setDeleteText(e.target.value)}
          autoComplete="off"
          className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-[15px] outline-none"
        />
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={!deleteConfirmed}
            onClick={() => void doDeleteAll()}
          >
            Delete everything
          </Button>
        </div>
      </BottomSheet>
    </>
  )
}
