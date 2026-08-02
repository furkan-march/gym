import type { ZodError } from 'zod/v4'
import type { GymDB } from '../db'
import { APP_VERSION, BACKUP_SCHEMA_VERSION, BACKUP_TABLES } from '../db'
import { nowIso } from '../ids'
import type { ActiveWorkoutState, AppBackup, RestTimerState } from '../types'
import { appBackupSchema } from './schema'

/**
 * Full JSON backup export/import (SPEC 30, replace strategy).
 * ActiveWorkoutState and RestTimerState are never part of the backup file;
 * import resets both singletons to their empty state.
 */

export type ImportResult =
  | { ok: true; counts: Record<string, number> }
  | { ok: false; error: string }

export type BackupPreview =
  | {
      ok: true
      summary: { table: string; count: number }[]
      exportedAt: string
      appVersion: string
    }
  | { ok: false; error: string }

const ALL_TABLES = [...BACKUP_TABLES, 'activeWorkoutState', 'restTimerState'] as const

/** Reads every backup table in one 'r' transaction so the snapshot is consistent. */
export async function exportBackup(db: GymDB): Promise<AppBackup> {
  const data: Partial<Record<(typeof BACKUP_TABLES)[number], unknown[]>> = {}
  await db.transaction(
    'r',
    BACKUP_TABLES.map((t) => db.table(t)),
    async () => {
      for (const t of BACKUP_TABLES) {
        data[t] = await db.table(t).toArray()
      }
    },
  )
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: nowIso(),
    data: data as AppBackup['data'],
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function formatZodError(error: ZodError): string {
  const shown = error.issues.slice(0, 3).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.map((p) => String(p)).join('.') : '(root)'
    return `${path}: ${issue.message}`
  })
  const rest = error.issues.length - shown.length
  const more = rest > 0 ? ` (and ${rest} more issue${rest === 1 ? '' : 's'})` : ''
  return `The backup file does not match the expected format. ${shown.join('; ')}${more}`
}

/**
 * JSON-parse (when given a string) and fully Zod-validate a backup file.
 * Newer schema versions are rejected before field-level validation so the
 * user sees the version message, not spurious shape errors. Older versions
 * would be migrated forward here; version 1 is the first schema, so there is
 * nothing to migrate yet.
 */
function parseBackup(raw: unknown): { ok: true; backup: AppBackup } | { ok: false; error: string } {
  let candidate: unknown = raw
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate)
    } catch {
      return { ok: false, error: 'The file is not valid JSON.' }
    }
  }
  if (typeof candidate === 'object' && candidate !== null && 'schemaVersion' in candidate) {
    const version = (candidate as { schemaVersion: unknown }).schemaVersion
    if (typeof version === 'number' && version > BACKUP_SCHEMA_VERSION) {
      return {
        ok: false,
        error: `This backup is from a newer version of the app (backup schema ${version}, this app reads up to ${BACKUP_SCHEMA_VERSION}). Update the app, then import again.`,
      }
    }
  }
  const result = appBackupSchema.safeParse(candidate)
  if (!result.success) {
    return { ok: false, error: formatZodError(result.error) }
  }
  return { ok: true, backup: result.data as unknown as AppBackup }
}

/** Summary for the import confirmation UI. Validates without touching the DB. */
export function previewBackup(raw: unknown): BackupPreview {
  const parsed = parseBackup(raw)
  if (!parsed.ok) return parsed
  return {
    ok: true,
    summary: BACKUP_TABLES.map((t) => ({ table: t as string, count: parsed.backup.data[t].length })),
    exportedAt: parsed.backup.exportedAt,
    appVersion: parsed.backup.appVersion,
  }
}

/**
 * Replace-strategy import (SPEC 30):
 * 1. refuse while a workout is active,
 * 2. validate fully before opening any transaction,
 * 3. clear + bulkAdd every table in ONE rw transaction (no non-IndexedDB
 *    awaits inside, so any failure rolls back atomically),
 * 4. reset the Active/RestTimer singletons,
 * 5. afterwards run the caller-provided personal-records rebuild.
 */
export async function importBackup(
  db: GymDB,
  raw: unknown,
  rebuild?: (db: GymDB) => Promise<unknown>,
): Promise<ImportResult> {
  const active = await db.activeWorkoutState.get('active')
  if (active != null && active.workoutSessionId != null) {
    return {
      ok: false,
      error:
        'A workout is currently active. Importing a backup replaces all data, so finish or discard the active workout first.',
    }
  }

  const parsed = parseBackup(raw)
  if (!parsed.ok) return parsed
  const backup = parsed.backup

  const now = nowIso()
  const emptyActive: ActiveWorkoutState = {
    id: 'active',
    workoutSessionId: null,
    currentExerciseSessionId: null,
    updatedAt: now,
  }
  const emptyRest: RestTimerState = {
    id: 'rest',
    endsAt: null,
    durationSeconds: 0,
    pausedRemainingSeconds: null,
    forExerciseSessionId: null,
    updatedAt: now,
  }

  const counts: Record<string, number> = {}
  try {
    await db.transaction(
      'rw',
      ALL_TABLES.map((t) => db.table(t)),
      async () => {
        for (const t of ALL_TABLES) {
          await db.table(t).clear()
        }
        for (const t of BACKUP_TABLES) {
          const rows = backup.data[t]
          counts[t] = rows.length
          if (rows.length > 0) {
            await db.table(t).bulkAdd(rows)
          }
        }
        await db.activeWorkoutState.add(emptyActive)
        await db.restTimerState.add(emptyRest)
      },
    )
  } catch (err) {
    return {
      ok: false,
      error: `Import failed and was rolled back; your existing data is unchanged. Cause: ${errorMessage(err)}`,
    }
  }

  if (rebuild) {
    try {
      await rebuild(db)
    } catch (err) {
      return {
        ok: false,
        error: `The backup was imported, but rebuilding personal records afterwards failed: ${errorMessage(err)}`,
      }
    }
  }

  return { ok: true, counts }
}
