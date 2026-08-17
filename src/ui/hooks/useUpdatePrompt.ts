import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * PWA update flow (SPEC 31): detect a waiting version, never interrupt an
 * active session — the banner offers "update after saving current workout".
 *
 * iOS keeps installed web apps suspended in the switcher, so the page (and its
 * registration-time update check) can go days without reloading. We therefore
 * also check for updates whenever the app returns to the foreground, and
 * hourly while it stays open.
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
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => void registration.update().catch(() => undefined)
      setInterval(check, 60 * 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })

  return {
    updateAvailable: needRefresh,
    offlineReady,
    applyUpdate: () => void updateServiceWorker(true),
  }
}
