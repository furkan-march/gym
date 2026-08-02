import { useEffect, useRef, useState } from 'react'

/**
 * Screen Wake Lock during active workouts (SPEC 12): timer alerts cannot fire
 * while the screen is off, so we keep it on. Re-acquires on visibilitychange;
 * reports unsupported/failed so the UI can show the one-line hint.
 */
export function useWakeLock(enabled: boolean): { supported: boolean; active: boolean } {
  const [active, setActive] = useState(false)
  const lockRef = useRef<WakeLockSentinel | null>(null)
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator

  useEffect(() => {
    if (!enabled || !supported) {
      setActive(false)
      return
    }
    let disposed = false

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (disposed) {
          void lock.release()
          return
        }
        lockRef.current = lock
        setActive(true)
        lock.addEventListener('release', () => {
          if (!disposed) setActive(false)
        })
      } catch {
        if (!disposed) setActive(false)
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisible)
      void lockRef.current?.release()
      lockRef.current = null
    }
  }, [enabled, supported])

  return { supported, active }
}
