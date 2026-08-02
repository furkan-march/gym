import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './lib/db'
import { activateSession, freezeSession, getResumableSession } from './lib/data/workouts'
import { useSettings } from './ui/hooks/useSettings'
import { useUpdatePrompt } from './ui/hooks/useUpdatePrompt'
import { Button } from './ui/components/core'
import TodayScreen from './ui/screens/Today'
import ActiveWorkoutScreen from './ui/screens/ActiveWorkout'
import HistoryScreen from './ui/screens/History'
import PlanScreen from './ui/screens/Plan'
import SettingsScreen from './ui/screens/Settings'

// Progress pulls in Recharts (~heavy); split it out of the core-loop bundle.
const ProgressScreen = lazy(() => import('./ui/screens/Progress'))

const TABS = [
  { to: '/', label: 'Today', icon: '☀︎' },
  { to: '/history', label: 'History', icon: '≣' },
  { to: '/progress', label: 'Progress', icon: '↗' },
  { to: '/plan', label: 'Plan', icon: '▦' },
  { to: '/settings', label: 'Settings', icon: '⚙︎' },
]

/** Freeze/resume active-time accumulation with app visibility (SPEC 11). */
function useActiveSessionLifecycle() {
  useEffect(() => {
    const onVisibility = async () => {
      const session = await getResumableSession()
      if (!session) return
      if (document.visibilityState === 'hidden') await freezeSession(session.id)
      else await activateSession(session.id)
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onVisibility)
    }
  }, [])
}

function UpdateBanner() {
  const { updateAvailable, applyUpdate } = useUpdatePrompt()
  const active = useLiveQuery(() => db.activeWorkoutState.get('active'), [])
  if (!updateAvailable) return null
  const inWorkout = active?.workoutSessionId != null
  return (
    <div className="mx-4 mt-2 flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 p-3">
      <span className="text-[13px]">
        A new version is available{inWorkout ? ' — update after saving your workout' : ''}.
      </span>
      {!inWorkout && (
        <Button variant="primary" onClick={applyUpdate}>
          Update
        </Button>
      )}
    </div>
  )
}

function ResumeBar() {
  const navigate = useNavigate()
  const active = useLiveQuery(async () => {
    const s = await db.activeWorkoutState.get('active')
    if (!s?.workoutSessionId) return null
    return (await db.workoutSessions.get(s.workoutSessionId)) ?? null
  }, [])
  if (!active || active.status !== 'active') return null
  return (
    <button
      onClick={() => navigate('/workout')}
      className="mx-4 mb-2 flex min-h-11 w-[calc(100%-2rem)] items-center justify-between rounded-xl border border-accent/40 bg-accent/10 px-4 text-accent"
    >
      <span className="text-[14px] font-medium">Workout in progress · {active.templateName}</span>
      <span className="text-[13px]">Resume →</span>
    </button>
  )
}

function TabLayout() {
  // h-dvh (not min-h): the shell is exactly viewport-high so <main> scrolls
  // internally and the tab bar stays pinned and always visible.
  return (
    <div className="pt-safe flex h-dvh flex-col">
      <UpdateBanner />
      <main className="flex-1 overflow-y-auto px-4 pb-4">
        <Outlet />
      </main>
      <ResumeBar />
      <nav className="pb-safe border-t border-border bg-surface">
        <div className="flex">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                `flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] ${
                  isActive ? 'text-accent' : 'text-text-muted'
                }`
              }
            >
              <span className="text-[17px] leading-none">{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default function App() {
  useActiveSessionLifecycle()
  const settings = useSettings()

  useEffect(() => {
    const theme = settings?.theme ?? 'dark'
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : theme
    document.documentElement.dataset['theme'] = resolved
  }, [settings?.theme])

  return (
    <HashRouter>
      <Routes>
        <Route element={<TabLayout />}>
          <Route index element={<TodayScreen />} />
          <Route path="history" element={<HistoryScreen />} />
          <Route
            path="progress"
            element={
              <Suspense
                fallback={
                  <p className="py-8 text-center text-[14px] text-text-muted">Loading…</p>
                }
              >
                <ProgressScreen />
              </Suspense>
            }
          />
          <Route path="plan" element={<PlanScreen />} />
          <Route path="settings" element={<SettingsScreen />} />
        </Route>
        <Route path="/workout" element={<ActiveWorkoutScreen />} />
      </Routes>
    </HashRouter>
  )
}
