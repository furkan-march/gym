import { describe, expect, it } from 'vitest'
import {
  addSeconds,
  pauseTimer,
  readTimer,
  resetTimer,
  resumeTimer,
  skipTimer,
  startTimer,
} from './restTimer'
import type { RestTimerState } from '../types'

const T0 = new Date('2026-08-04T18:00:00.000Z')

function at(offsetSeconds: number): Date {
  return new Date(T0.getTime() + offsetSeconds * 1000)
}

const IDLE: RestTimerState = {
  id: 'rest',
  endsAt: null,
  durationSeconds: 150,
  pausedRemainingSeconds: null,
  forExerciseSessionId: null,
  updatedAt: T0.toISOString(),
}

describe('startTimer', () => {
  it('sets endsAt to now + duration and clears pause', () => {
    const s = startTimer(90, T0, 'es-1')
    expect(s.endsAt).toBe(at(90).toISOString())
    expect(s.durationSeconds).toBe(90)
    expect(s.pausedRemainingSeconds).toBeNull()
    expect(s.forExerciseSessionId).toBe('es-1')
    expect(s.updatedAt).toBe(T0.toISOString())
  })

  it('clamps negative durations to zero', () => {
    const s = startTimer(-30, T0)
    expect(s.durationSeconds).toBe(0)
    expect(s.endsAt).toBe(T0.toISOString())
  })
})

describe('readTimer', () => {
  it('reads idle when no timer exists', () => {
    expect(readTimer(IDLE, T0)).toEqual({
      status: 'idle',
      remainingSeconds: 0,
      expiredAgoSeconds: null,
    })
  })

  it('counts down from absolute timestamps while running', () => {
    const s = startTimer(90, T0)
    expect(readTimer(s, at(30))).toEqual({
      status: 'running',
      remainingSeconds: 60,
      expiredAgoSeconds: null,
    })
  })

  it('ceils fractional remaining seconds so the countdown never shows 0 early', () => {
    const s = startTimer(90, T0)
    const reading = readTimer(s, new Date(at(89).getTime() + 500))
    expect(reading.status).toBe('running')
    expect(reading.remainingSeconds).toBe(1)
  })

  it('suspension recovery: a 90 s timer read 10 minutes later is expired with expiredAgo', () => {
    const s = startTimer(90, T0)
    // App suspended (screen locked); JS frozen; read again 10 minutes later.
    const reading = readTimer(s, at(600))
    expect(reading).toEqual({
      status: 'expired',
      remainingSeconds: 0,
      expiredAgoSeconds: 510, // "Rest finished 8:30 ago"
    })
  })

  it('reads expired with expiredAgo 0 exactly at the end timestamp', () => {
    const s = startTimer(90, T0)
    expect(readTimer(s, at(90))).toEqual({
      status: 'expired',
      remainingSeconds: 0,
      expiredAgoSeconds: 0,
    })
  })
})

describe('pause / resume', () => {
  it('pause captures remaining seconds and holds them regardless of wall time', () => {
    const s = pauseTimer(startTimer(90, T0), at(30))
    expect(s.pausedRemainingSeconds).toBe(60)
    expect(s.endsAt).toBeNull()
    // 5 minutes pass while paused: remaining must not move.
    expect(readTimer(s, at(330))).toEqual({
      status: 'paused',
      remainingSeconds: 60,
      expiredAgoSeconds: null,
    })
  })

  it('resume counts the captured remainder down from the resume instant', () => {
    const paused = pauseTimer(startTimer(90, T0), at(30)) // 60 s left
    const resumed = resumeTimer(paused, at(330))
    expect(resumed.pausedRemainingSeconds).toBeNull()
    expect(resumed.endsAt).toBe(at(390).toISOString())
    expect(readTimer(resumed, at(340)).remainingSeconds).toBe(50)
    expect(readTimer(resumed, at(340)).status).toBe('running')
  })

  it('pause/resume round-trip loses no time', () => {
    const s1 = startTimer(120, T0)
    const s2 = resumeTimer(pauseTimer(s1, at(45)), at(1000)) // paused with 75 s left
    expect(readTimer(s2, at(1000)).remainingSeconds).toBe(75)
    expect(readTimer(s2, at(1075)).status).toBe('expired')
  })

  it('pause is a no-op on idle, paused, and expired states', () => {
    expect(pauseTimer(IDLE, T0)).toBe(IDLE)
    const paused = pauseTimer(startTimer(90, T0), at(30))
    expect(pauseTimer(paused, at(40))).toBe(paused)
    const expired = startTimer(90, T0)
    expect(pauseTimer(expired, at(600))).toBe(expired)
    expect(readTimer(pauseTimer(expired, at(600)), at(600)).status).toBe('expired')
  })

  it('resume is a no-op when not paused', () => {
    expect(resumeTimer(IDLE, T0)).toBe(IDLE)
    const running = startTimer(90, T0)
    expect(resumeTimer(running, at(10))).toBe(running)
  })
})

describe('addSeconds', () => {
  it('adds 30 seconds to a running timer', () => {
    const s = addSeconds(startTimer(90, T0), 30, at(30)) // 60 left -> 90
    expect(readTimer(s, at(30))).toEqual({
      status: 'running',
      remainingSeconds: 90,
      expiredAgoSeconds: null,
    })
  })

  it('subtracting below zero clamps to 0 and expires immediately, never negative', () => {
    const s = addSeconds(startTimer(90, T0), -120, at(30)) // 60 left - 120 -> 0
    const reading = readTimer(s, at(30))
    expect(reading.status).toBe('expired')
    expect(reading.remainingSeconds).toBe(0)
    expect(reading.expiredAgoSeconds).toBe(0)
  })

  it('adjusts the captured remainder while paused, clamped at 0', () => {
    const paused = pauseTimer(startTimer(90, T0), at(30)) // 60 left
    expect(addSeconds(paused, 30, at(40)).pausedRemainingSeconds).toBe(90)
    expect(addSeconds(paused, -90, at(40)).pausedRemainingSeconds).toBe(0)
  })

  it('adding to an expired timer restarts the countdown from now', () => {
    const s = addSeconds(startTimer(90, T0), 30, at(600)) // long expired
    expect(readTimer(s, at(600))).toEqual({
      status: 'running',
      remainingSeconds: 30,
      expiredAgoSeconds: null,
    })
  })

  it('is a no-op on idle', () => {
    expect(addSeconds(IDLE, 30, T0)).toBe(IDLE)
  })
})

describe('skip and reset', () => {
  it('skip returns the timer to idle from running, paused, or expired', () => {
    const running = startTimer(90, T0)
    expect(readTimer(skipTimer(running), at(30)).status).toBe('idle')
    const paused = pauseTimer(running, at(30))
    expect(readTimer(skipTimer(paused), at(30)).status).toBe('idle')
    expect(readTimer(skipTimer(running), at(600)).status).toBe('idle')
    expect(skipTimer(IDLE)).toBe(IDLE)
  })

  it('reset restarts the full configured duration from now', () => {
    const s = startTimer(150, T0)
    const reset = resetTimer(addSeconds(s, -60, at(30)), at(45))
    expect(reset.endsAt).toBe(at(45 + 150).toISOString())
    expect(readTimer(reset, at(45)).remainingSeconds).toBe(150)
  })

  it('reset clears a pause and uses the configured duration', () => {
    const paused = pauseTimer(startTimer(150, T0), at(30))
    const reset = resetTimer(paused, at(400))
    expect(reset.pausedRemainingSeconds).toBeNull()
    expect(readTimer(reset, at(400)).remainingSeconds).toBe(150)
  })
})
