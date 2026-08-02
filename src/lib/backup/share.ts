import type { GymDB } from '../db'
import { nowIso } from '../ids'
import type { AppSettings } from '../types'

/**
 * Browser glue for exporting files and storage persistence (SPEC 28/30).
 * Everything is feature-detected: iOS standalone PWAs cannot rely on anchor
 * downloads, so the share sheet is the primary path, then anchor download
 * (desktop), then clipboard.
 */

export type ExportOutcome = 'shared' | 'downloaded' | 'clipboard' | 'failed'

interface ShareCapableNavigator {
  share?: (data: ShareData) => Promise<void>
  canShare?: (data: ShareData) => boolean
  clipboard?: { writeText?: (text: string) => Promise<void> }
}

export async function exportFile(
  filename: string,
  mime: string,
  content: string,
): Promise<ExportOutcome> {
  const nav = navigator as unknown as ShareCapableNavigator

  // 1) Web Share with files — primary path on iOS (SPEC 30).
  try {
    if (typeof File !== 'undefined' && nav.share && nav.canShare) {
      const file = new File([content], filename, { type: mime })
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file] })
        return 'shared'
      }
    }
  } catch (err) {
    // User cancelled the share sheet: do not surprise them with a download.
    // 'failed' keeps the caller from recording a successful backup.
    if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
      return 'failed'
    }
    // Any other share error falls through to the download path.
  }

  // 2) Anchor download for desktop browsers.
  try {
    if (typeof document !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(new Blob([content], { type: mime }))
      try {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = filename
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
      } finally {
        URL.revokeObjectURL(url)
      }
      return 'downloaded'
    }
  } catch {
    // fall through to clipboard
  }

  // 3) Clipboard as the last resort.
  try {
    const writeText = nav.clipboard?.writeText
    if (typeof writeText === 'function') {
      await writeText.call(nav.clipboard, content)
      return 'clipboard'
    }
  } catch {
    // fall through
  }

  return 'failed'
}

export interface PersistenceStatus {
  persisted: boolean
  usage: number | null
  quota: number | null
}

/**
 * Requests persistent storage and reports the current estimate (SPEC 30,
 * STORAGE PERSISTENCE). Never throws; unknown values come back as null.
 */
export async function requestPersistence(): Promise<PersistenceStatus> {
  const storage = (navigator as { storage?: StorageManager }).storage
  let persisted = false
  if (storage) {
    try {
      if (typeof storage.persist === 'function') {
        persisted = await storage.persist()
      } else if (typeof storage.persisted === 'function') {
        persisted = await storage.persisted()
      }
    } catch {
      persisted = false
    }
  }
  let usage: number | null = null
  let quota: number | null = null
  if (storage && typeof storage.estimate === 'function') {
    try {
      const estimate = await storage.estimate()
      usage = estimate.usage ?? null
      quota = estimate.quota ?? null
    } catch {
      // leave nulls
    }
  }
  return { persisted, usage, quota }
}

/** Records a successful backup export on the settings singleton. */
export async function markBackupDone(db: GymDB): Promise<void> {
  const now = nowIso()
  await db.appSettings.update('settings', { lastBackupAt: now, updatedAt: now })
}

export const BACKUP_REMINDER_MIN_DAYS = 14
export const BACKUP_REMINDER_MIN_SESSIONS = 5

/**
 * Non-nagging backup reminder (SPEC 28): due only when BOTH 14+ days have
 * passed since the last export AND 5+ sessions have been logged since it.
 * With no backup ever taken, only the session threshold gates the banner.
 */
export function backupReminderDue(
  settings: Pick<AppSettings, 'lastBackupAt'>,
  sessionCountSinceBackup: number,
  now: Date = new Date(),
): boolean {
  if (sessionCountSinceBackup < BACKUP_REMINDER_MIN_SESSIONS) return false
  if (settings.lastBackupAt == null) return true
  const elapsedMs = now.getTime() - new Date(settings.lastBackupAt).getTime()
  return elapsedMs >= BACKUP_REMINDER_MIN_DAYS * 24 * 60 * 60 * 1000
}
