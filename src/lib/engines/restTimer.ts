import type { RestTimerState } from '../types'

/**
 * Rest-timer state math (SPEC 12, acceptance criterion 14).
 *
 * Pure functions over RestTimerState. All state is derived from ABSOLUTE
 * timestamps (`endsAt`) or an explicit paused snapshot, so iOS suspension can
 * never desync the timer: on resume, `readTimer(state, now)` recomputes
 * everything from the persisted state, including the distinct
 * "Rest finished N:SS ago" expired state.
 *
 * State shape invariants maintained here:
 * - running:  endsAt != null, pausedRemainingSeconds == null
 * - paused:   endsAt == null, pausedRemainingSeconds != null
 * - idle:     endsAt == null, pausedRemainingSeconds == null
 * - expired is not stored — it is DERIVED (endsAt in the past).
 */

export type RestTimerStatus = 'idle' | 'running' | 'paused' | 'expired'

export interface RestTimerReading {
  status: RestTimerStatus
  /** whole seconds left; 0 when idle or expired. Ceiled so 0.4 s left shows 1. */
  remainingSeconds: number
  /** whole seconds since expiry ("Rest finished N:SS ago"); null unless expired */
  expiredAgoSeconds: number | null
}

function iso(now: Date): string {
  return now.toISOString()
}

/** Start a fresh countdown of `durationSeconds` from `now`. */
export function startTimer(
  durationSeconds: number,
  now: Date,
  forExerciseSessionId: string | null = null,
): RestTimerState {
  const duration = Math.max(0, Math.round(durationSeconds))
  return {
    id: 'rest',
    endsAt: new Date(now.getTime() + duration * 1000).toISOString(),
    durationSeconds: duration,
    pausedRemainingSeconds: null,
    forExerciseSessionId,
    updatedAt: iso(now),
  }
}

/**
 * Pause a running timer, capturing the remaining seconds. No-op when idle,
 * already paused, or already expired (the expired state must keep reporting
 * how long ago rest finished).
 */
export function pauseTimer(state: RestTimerState, now: Date): RestTimerState {
  if (state.endsAt == null || state.pausedRemainingSeconds != null) return state
  const remainingMs = Date.parse(state.endsAt) - now.getTime()
  if (remainingMs <= 0) return state
  return {
    ...state,
    endsAt: null,
    pausedRemainingSeconds: Math.ceil(remainingMs / 1000),
    updatedAt: iso(now),
  }
}

/** Resume a paused timer: the captured remainder counts down from `now`. */
export function resumeTimer(state: RestTimerState, now: Date): RestTimerState {
  if (state.pausedRemainingSeconds == null) return state
  return {
    ...state,
    endsAt: new Date(now.getTime() + state.pausedRemainingSeconds * 1000).toISOString(),
    pausedRemainingSeconds: null,
    updatedAt: iso(now),
  }
}

/**
 * Add (or with negative `delta`, subtract) seconds. Remaining time clamps at 0:
 * subtracting past zero expires the timer at `now`, never goes negative.
 * Adding to an already-expired timer restarts the countdown from `now`.
 * No-op when idle.
 */
export function addSeconds(state: RestTimerState, delta: number, now: Date): RestTimerState {
  if (state.pausedRemainingSeconds != null) {
    return {
      ...state,
      pausedRemainingSeconds: Math.max(0, state.pausedRemainingSeconds + delta),
      updatedAt: iso(now),
    }
  }
  if (state.endsAt == null) return state
  const remainingMs = Math.max(0, Date.parse(state.endsAt) - now.getTime())
  const newRemainingMs = Math.max(0, remainingMs + delta * 1000)
  return {
    ...state,
    endsAt: new Date(now.getTime() + newRemainingMs).toISOString(),
    updatedAt: iso(now),
  }
}

/**
 * Skip the rest entirely: back to idle. Takes no `now` on purpose — it only
 * clears absolute state and leaves `updatedAt` for the persistence layer.
 */
export function skipTimer(state: RestTimerState): RestTimerState {
  if (state.endsAt == null && state.pausedRemainingSeconds == null) return state
  return { ...state, endsAt: null, pausedRemainingSeconds: null }
}

/** Restart the full configured duration from `now` (clears any pause). */
export function resetTimer(state: RestTimerState, now: Date): RestTimerState {
  const duration = Math.max(0, state.durationSeconds)
  return {
    ...state,
    endsAt: new Date(now.getTime() + duration * 1000).toISOString(),
    pausedRemainingSeconds: null,
    updatedAt: iso(now),
  }
}

/**
 * Derive the display state purely from persisted timestamps and `now`.
 * Never yields a stale or negative countdown after suspension: a past
 * `endsAt` reads as `expired` with `expiredAgoSeconds` set (SPEC 12).
 */
export function readTimer(state: RestTimerState, now: Date): RestTimerReading {
  if (state.pausedRemainingSeconds != null) {
    return {
      status: 'paused',
      remainingSeconds: Math.max(0, state.pausedRemainingSeconds),
      expiredAgoSeconds: null,
    }
  }
  if (state.endsAt == null) {
    return { status: 'idle', remainingSeconds: 0, expiredAgoSeconds: null }
  }
  const deltaMs = Date.parse(state.endsAt) - now.getTime()
  if (deltaMs > 0) {
    return { status: 'running', remainingSeconds: Math.ceil(deltaMs / 1000), expiredAgoSeconds: null }
  }
  // Math.max normalizes the -0 that Math.floor produces when deltaMs === 0.
  return {
    status: 'expired',
    remainingSeconds: 0,
    expiredAgoSeconds: Math.max(0, Math.floor(-deltaMs / 1000)),
  }
}
