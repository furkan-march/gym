import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { nowIso } from '../../lib/ids'
import type { AppSettings, UserProfile } from '../../lib/types'

export function useSettings(): AppSettings | undefined {
  return useLiveQuery(() => db.appSettings.get('settings'), [])
}

export function useProfile(): UserProfile | undefined {
  return useLiveQuery(() => db.userProfile.get('profile'), [])
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  await db.appSettings.update('settings', { ...patch, updatedAt: nowIso() })
}

export async function updateProfile(patch: Partial<UserProfile>): Promise<void> {
  await db.userProfile.update('profile', { ...patch, updatedAt: nowIso() })
}
