import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * PWA update flow (SPEC 31): detect a waiting version, never interrupt an
 * active session — the banner offers "update after saving current workout".
 */
export function useUpdatePrompt(): {
  updateAvailable: boolean
  applyUpdate: () => void
  offlineReady: boolean
} {
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  return {
    updateAvailable: needRefresh,
    offlineReady,
    applyUpdate: () => void updateServiceWorker(true),
  }
}
