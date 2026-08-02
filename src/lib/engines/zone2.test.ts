import { describe, expect, it } from 'vitest'
import type { CardioSession, ReadinessLog, ScheduledDay, Weekday } from '../types'
import { suggestSecondZone2, type SecondZone2Input } from './zone2'

/**
 * Second Zone 2 suggestion gates (SPEC 39, V2 item 6). Fixed calendar week:
 * Mon 2026-07-20 … Sun 2026-07-26; "today" is Saturday 2026-07-25 (a rest
 * day), the scheduled Zone 2 day is Wednesday 2026-07-22.
 */

const T = '2026-07-01T10:00:00.000Z'
const TODAY = '2026-07-25' // Saturday
const ZONE2_DAY_KEY = '2026-07-22' // Wednesday

function day(weekday: Weekday, planKind: ScheduledDay['planKind']): ScheduledDay {
  return {
    id: String(weekday),
    weekday,
    planKind,
    templateId: planKind === 'strength' ? 'tpl' : null,
    postureRequired: false,
    postureOptional: false,
    cardioMinutesMin: null,
    cardioMinutesMax: null,
    stepsOptional: false,
    updatedAt: T,
  }
}

/** Sun rest, Mon recovery, Tue/Thu strength, Wed zone2, Fri recovery, Sat rest. */
function defaultDays(): ScheduledDay[] {
  return [
    day(0, 'rest'),
    day(1, 'recovery'),
    day(2, 'strength'),
    day(3, 'zone2'),
    day(4, 'strength'),
    day(5, 'recovery'),
    day(6, 'rest'),
  ]
}

let nextCardioId = 0
function cardio(dateKey: string, over: Partial<CardioSession> = {}): CardioSession {
  return {
    id: `c-${++nextCardioId}`,
    dateKey,
    type: 'inclineTreadmill',
    minutes: 35,
    distanceKm: null,
    avgHeartRate: null,
    perceivedIntensity: 2,
    isZone2: true,
    createdAt: T,
    updatedAt: T,
    ...over,
  }
}

let nextReadinessId = 0
function readiness(dateKey: string, energy: number): ReadinessLog {
  return {
    id: `r-${++nextReadinessId}`,
    dateKey,
    workoutSessionId: null,
    sleep: 3,
    energy,
    motivation: 3,
    soreness: 3,
    stress: 3,
    kneeComfort: null,
    createdAt: T,
  }
}

function baseInput(over: Partial<SecondZone2Input> = {}): SecondZone2Input {
  return {
    todayKey: TODAY,
    weekStartsOn: 1,
    scheduledDays: defaultDays(),
    cardio: [cardio(ZONE2_DAY_KEY)],
    readiness: [],
    hasActiveFatigueNotice: false,
    weeklyZone2Target: 1,
    ...over,
  }
}

describe('suggestSecondZone2', () => {
  it('suggests with a non-empty reason when every gate holds', () => {
    const result = suggestSecondZone2(baseInput())
    expect(result.suggest).toBe(true)
    expect(result.reason.length).toBeGreaterThan(0)
  })

  it('suggests when no readiness logs exist at all', () => {
    const result = suggestSecondZone2(baseInput({ readiness: [] }))
    expect(result.suggest).toBe(true)
  })

  it('suggests when the last 3 readiness logs average energy >= 3', () => {
    const result = suggestSecondZone2(
      baseInput({
        readiness: [
          readiness('2026-07-21', 3),
          readiness('2026-07-23', 3),
          readiness('2026-07-24', 4),
        ],
      }),
    )
    expect(result.suggest).toBe(true)
  })

  it('suggests on a recovery day too', () => {
    // Friday 2026-07-24 is a recovery day in the fixture schedule.
    const result = suggestSecondZone2(baseInput({ todayKey: '2026-07-24' }))
    expect(result.suggest).toBe(true)
  })

  it('does not suggest when today is not a rest or recovery day', () => {
    // Thursday 2026-07-23 is a strength day.
    const result = suggestSecondZone2(
      baseInput({ todayKey: '2026-07-23', cardio: [cardio(ZONE2_DAY_KEY)] }),
    )
    expect(result.suggest).toBe(false)
    expect(result.reason).toBe('')
  })

  it('does not suggest when the scheduled Zone 2 session is not logged yet', () => {
    const result = suggestSecondZone2(baseInput({ cardio: [] }))
    expect(result.suggest).toBe(false)
  })

  it('does not suggest when Zone 2 was logged this week but not on the scheduled day', () => {
    // Tuesday instead of the scheduled Wednesday.
    const result = suggestSecondZone2(baseInput({ cardio: [cardio('2026-07-21')] }))
    expect(result.suggest).toBe(false)
  })

  it('does not count non-Zone-2 cardio on the scheduled day', () => {
    const result = suggestSecondZone2(
      baseInput({ cardio: [cardio(ZONE2_DAY_KEY, { isZone2: false })] }),
    )
    expect(result.suggest).toBe(false)
  })

  it('does not count a Zone 2 session from a previous week', () => {
    const result = suggestSecondZone2(baseInput({ cardio: [cardio('2026-07-15')] }))
    expect(result.suggest).toBe(false)
  })

  it('does not suggest while a fatigue or deload notice is active', () => {
    const result = suggestSecondZone2(baseInput({ hasActiveFatigueNotice: true }))
    expect(result.suggest).toBe(false)
  })

  it('does not suggest when the last 3 readiness logs average energy < 3', () => {
    const result = suggestSecondZone2(
      baseInput({
        readiness: [
          readiness('2026-07-21', 2),
          readiness('2026-07-23', 2),
          readiness('2026-07-24', 3),
        ],
      }),
    )
    expect(result.suggest).toBe(false)
  })

  it('averages only the LAST 3 readiness logs — older low-energy logs are ignored', () => {
    const result = suggestSecondZone2(
      baseInput({
        readiness: [
          readiness('2026-07-10', 1),
          readiness('2026-07-11', 1),
          readiness('2026-07-21', 4),
          readiness('2026-07-23', 4),
          readiness('2026-07-24', 4),
        ],
      }),
    )
    expect(result.suggest).toBe(true)
  })

  it('does not suggest once weeklyZone2Target + 1 Zone 2 sessions are already logged', () => {
    const result = suggestSecondZone2(
      baseInput({ cardio: [cardio(ZONE2_DAY_KEY), cardio('2026-07-24')] }),
    )
    expect(result.suggest).toBe(false)
  })

  it('does not suggest when the schedule has no Zone 2 day at all', () => {
    const days = defaultDays().map((d) =>
      d.planKind === 'zone2' ? { ...d, planKind: 'rest' as const } : d,
    )
    const result = suggestSecondZone2(baseInput({ scheduledDays: days }))
    expect(result.suggest).toBe(false)
  })
})
