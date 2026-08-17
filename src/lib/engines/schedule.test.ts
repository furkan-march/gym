import type {
  DateKey,
  PlanKind,
  ScheduledDay,
  Weekday,
  WorkoutSession,
  WorkoutTemplate,
} from '../types'
import { describePlan, findMissedWorkout, getPlanForDate, weekDateKeys } from './schedule'

// Local fixture ids: these tests exercise the ENGINE with a 3-day scenario;
// they are intentionally decoupled from the live seeded program.
const TEMPLATE_IDS = { upperA: 'tpl-fix-upper-a', upperB: 'tpl-fix-upper-b', lower: 'tpl-fix-lower' } as const

/**
 * SPEC 35 SCHEDULING: all tests use fixed dates, never the real current date.
 * 2026-08-02 Sun / 03 Mon / 04 Tue / 05 Wed / 06 Thu / 07 Fri / 08 Sat.
 */

const T = '2026-08-01T10:00:00.000Z'
const PROGRAM_START: DateKey = '2026-08-02'

function day(weekday: Weekday, planKind: PlanKind, templateId: string | null = null): ScheduledDay {
  return {
    id: String(weekday),
    weekday,
    planKind,
    templateId,
    postureRequired: planKind === 'recovery',
    postureOptional: planKind === 'zone2' || planKind === 'rest',
    cardioMinutesMin: planKind === 'zone2' ? 30 : null,
    cardioMinutesMax: planKind === 'zone2' ? 40 : null,
    stepsOptional: planKind === 'rest',
    updatedAt: T,
  }
}

// Mirrors the seeded schedule (SPEC 5): Legs Sunday, Upper A Tuesday, Upper B Thursday.
const DAYS: ScheduledDay[] = [
  day(0, 'strength', TEMPLATE_IDS.lower),
  day(1, 'recovery'),
  day(2, 'strength', TEMPLATE_IDS.upperA),
  day(3, 'zone2'),
  day(4, 'strength', TEMPLATE_IDS.upperB),
  day(5, 'recovery'),
  day(6, 'rest'),
]

const TEMPLATES: WorkoutTemplate[] = [
  { id: TEMPLATE_IDS.upperA, name: 'Upper A', kind: 'upperA', isDefault: true, orderIndex: 0, createdAt: T, updatedAt: T },
  { id: TEMPLATE_IDS.upperB, name: 'Upper B', kind: 'upperB', isDefault: true, orderIndex: 1, createdAt: T, updatedAt: T },
  { id: TEMPLATE_IDS.lower, name: 'Lower / Legs', kind: 'lower', isDefault: true, orderIndex: 2, createdAt: T, updatedAt: T },
]

function session(over: Partial<WorkoutSession> & { dateKey: DateKey }): WorkoutSession {
  return {
    id: `ws-${over.dateKey}-${over.templateId ?? 'none'}`,
    templateId: TEMPLATE_IDS.lower,
    templateName: 'Lower / Legs',
    templateKind: 'lower',
    startedAt: T,
    finishedAt: T,
    status: 'completed',
    bodyweightAtSessionKg: 87,
    activeSeconds: 3600,
    lastActivatedAt: null,
    createdAt: T,
    updatedAt: T,
    ...over,
  }
}

describe('Date.getDay mapping (SPEC 5)', () => {
  it('maps the fixed test dates to the documented weekday numbers', () => {
    expect(new Date(2026, 7, 2).getDay()).toBe(0) // Sunday
    expect(new Date(2026, 7, 3).getDay()).toBe(1) // Monday
    expect(new Date(2026, 7, 4).getDay()).toBe(2) // Tuesday
    expect(new Date(2026, 7, 5).getDay()).toBe(3) // Wednesday
    expect(new Date(2026, 7, 6).getDay()).toBe(4) // Thursday
    expect(new Date(2026, 7, 7).getDay()).toBe(5) // Friday
    expect(new Date(2026, 7, 8).getDay()).toBe(6) // Saturday
  })
})

describe('getPlanForDate + describePlan (SPEC 35 SCHEDULING, criteria 1-3)', () => {
  it('Sunday returns Lower / Legs', () => {
    const plan = getPlanForDate(new Date(2026, 7, 2), DAYS)
    expect(plan.planKind).toBe('strength')
    expect(plan.templateId).toBe(TEMPLATE_IDS.lower)
    const desc = describePlan(plan, TEMPLATES)
    expect(desc.title).toBe('Lower / Legs')
    expect(desc.primaryAction).toBe('Start Legs Workout')
  })

  it('Tuesday returns Upper A', () => {
    const plan = getPlanForDate(new Date(2026, 7, 4), DAYS)
    expect(plan.templateId).toBe(TEMPLATE_IDS.upperA)
    expect(describePlan(plan, TEMPLATES)).toEqual({
      title: 'Upper A',
      primaryAction: 'Start Upper A',
    })
  })

  it('Thursday returns Upper B', () => {
    const plan = getPlanForDate(new Date(2026, 7, 6), DAYS)
    expect(plan.templateId).toBe(TEMPLATE_IDS.upperB)
    expect(describePlan(plan, TEMPLATES)).toEqual({
      title: 'Upper B',
      primaryAction: 'Start Upper B',
    })
  })

  it('Wednesday returns Zone 2', () => {
    const plan = getPlanForDate(new Date(2026, 7, 5), DAYS)
    expect(plan.planKind).toBe('zone2')
    expect(plan.cardioMinutesMin).toBe(30)
    expect(plan.cardioMinutesMax).toBe(40)
    expect(describePlan(plan, TEMPLATES)).toEqual({ title: 'Zone 2 Cardio', primaryAction: null })
  })

  it('Monday returns Recovery Day', () => {
    const plan = getPlanForDate(new Date(2026, 7, 3), DAYS)
    expect(plan.planKind).toBe('recovery')
    expect(describePlan(plan, TEMPLATES)).toEqual({ title: 'Recovery Day', primaryAction: null })
  })

  it('Friday returns Recovery Day', () => {
    const plan = getPlanForDate(new Date(2026, 7, 7), DAYS)
    expect(plan.planKind).toBe('recovery')
    expect(describePlan(plan, TEMPLATES).title).toBe('Recovery Day')
  })

  it('Saturday returns Rest or Light Walk', () => {
    const plan = getPlanForDate(new Date(2026, 7, 8), DAYS)
    expect(plan.planKind).toBe('rest')
    expect(describePlan(plan, TEMPLATES)).toEqual({
      title: 'Rest or Light Walk',
      primaryAction: null,
    })
  })

  it('renamed strength templates flow into title and action', () => {
    const renamed = TEMPLATES.map((t) =>
      t.id === TEMPLATE_IDS.upperA ? { ...t, name: 'Push Day' } : t,
    )
    const plan = getPlanForDate(new Date(2026, 7, 4), DAYS)
    expect(describePlan(plan, renamed)).toEqual({ title: 'Push Day', primaryAction: 'Start Push Day' })
  })

  it('a strength day with a missing template still describes a usable plan', () => {
    const orphan = day(2, 'strength', 'tpl-deleted')
    expect(describePlan(orphan, TEMPLATES)).toEqual({
      title: 'Strength Workout',
      primaryAction: 'Start Workout',
    })
  })

  it('throws on a schedule missing a weekday row (data-integrity bug)', () => {
    const incomplete = DAYS.filter((d) => d.weekday !== 0)
    expect(() => getPlanForDate(new Date(2026, 7, 2), incomplete)).toThrow(/weekday 0/)
  })
})

describe('changing a scheduled day does not alter history (SPEC 5/35)', () => {
  it('moving Legs from Sunday to Saturday leaves completed sessions untouched', () => {
    const sessions = [session({ dateKey: '2026-08-02', templateId: TEMPLATE_IDS.lower })]
    const before = structuredClone(sessions)

    const movedDays: ScheduledDay[] = DAYS.map((d) => {
      if (d.weekday === 0) return { ...d, planKind: 'rest' as const, templateId: null }
      if (d.weekday === 6) return { ...d, planKind: 'strength' as const, templateId: TEMPLATE_IDS.lower }
      return d
    })

    // The new schedule takes effect for future lookups...
    expect(getPlanForDate(new Date(2026, 7, 9), movedDays).planKind).toBe('rest')
    expect(getPlanForDate(new Date(2026, 7, 8), movedDays).templateId).toBe(TEMPLATE_IDS.lower)

    // ...while history keeps its completed template and date (never mutated).
    expect(sessions).toEqual(before)
    expect(sessions[0]?.templateName).toBe('Lower / Legs')
    expect(sessions[0]?.dateKey).toBe('2026-08-02')
  })
})

describe('findMissedWorkout lifecycle (SPEC 5, SESSION DATE AND MISSED WORKOUTS)', () => {
  it("today's scheduled workout is not missed before midnight passes", () => {
    expect(findMissedWorkout('2026-08-02', DAYS, [], PROGRAM_START, [])).toBeNull()
  })

  it('reports Sunday Legs as missed on Monday when nothing was started', () => {
    expect(findMissedWorkout('2026-08-03', DAYS, [], PROGRAM_START, [])).toEqual({
      dateKey: '2026-08-02',
      templateId: TEMPLATE_IDS.lower,
    })
  })

  it('a completed session started on the scheduled day clears the miss', () => {
    const sessions = [session({ dateKey: '2026-08-02', templateId: TEMPLATE_IDS.lower })]
    expect(findMissedWorkout('2026-08-03', DAYS, sessions, PROGRAM_START, [])).toBeNull()
  })

  it('a session started that day but finished after midnight still counts for that day', () => {
    // dateKey is the local start date (SPEC 5), so a midnight-crossing session clears it.
    const sessions = [
      session({
        dateKey: '2026-08-02',
        templateId: TEMPLATE_IDS.lower,
        startedAt: '2026-08-02T22:30:00.000Z',
        finishedAt: '2026-08-03T00:20:00.000Z',
      }),
    ]
    expect(findMissedWorkout('2026-08-03', DAYS, sessions, PROGRAM_START, [])).toBeNull()
  })

  it('discarded or still-active sessions do not clear the miss', () => {
    const sessions = [
      session({ dateKey: '2026-08-02', templateId: TEMPLATE_IDS.lower, status: 'discarded' }),
      session({
        id: 'ws-active',
        dateKey: '2026-08-02',
        templateId: TEMPLATE_IDS.lower,
        status: 'active',
        finishedAt: null,
      }),
    ]
    expect(findMissedWorkout('2026-08-03', DAYS, sessions, PROGRAM_START, [])).toEqual({
      dateKey: '2026-08-02',
      templateId: TEMPLATE_IDS.lower,
    })
  })

  it('completing the workout on a later day clears the miss', () => {
    const sessions = [session({ dateKey: '2026-08-03', templateId: TEMPLATE_IDS.lower })]
    expect(findMissedWorkout('2026-08-04', DAYS, sessions, PROGRAM_START, [])).toBeNull()
  })

  it('dismissal hides the miss', () => {
    expect(findMissedWorkout('2026-08-03', DAYS, [], PROGRAM_START, ['2026-08-02'])).toBeNull()
  })

  it('returns the most recent live miss; dismissing it reveals the older one', () => {
    // Wednesday: Sunday Legs and Tuesday Upper A both missed.
    expect(findMissedWorkout('2026-08-05', DAYS, [], PROGRAM_START, [])).toEqual({
      dateKey: '2026-08-04',
      templateId: TEMPLATE_IDS.upperA,
    })
    expect(findMissedWorkout('2026-08-05', DAYS, [], PROGRAM_START, ['2026-08-04'])).toEqual({
      dateKey: '2026-08-02',
      templateId: TEMPLATE_IDS.lower,
    })
  })

  it('persists until the next scheduled occurrence of the same template', () => {
    const dismissed: DateKey[] = ['2026-08-04', '2026-08-06']
    // Saturday: next Legs day (2026-08-09) has not arrived — still shown.
    expect(findMissedWorkout('2026-08-08', DAYS, [], PROGRAM_START, dismissed)).toEqual({
      dateKey: '2026-08-02',
      templateId: TEMPLATE_IDS.lower,
    })
    // Next Sunday: the template's next occurrence arrived — miss expires.
    expect(findMissedWorkout('2026-08-09', DAYS, [], PROGRAM_START, dismissed)).toBeNull()
  })

  it('never reports days before the program start', () => {
    // 2026-07-30 was a Thursday (Upper B slot) but predates the program.
    expect(findMissedWorkout('2026-08-02', DAYS, [], PROGRAM_START, [])).toBeNull()
    expect(findMissedWorkout('2026-08-03', DAYS, [], '2026-08-03', [])).toBeNull()
  })
})

describe('weekDateKeys', () => {
  it('Monday-start week containing Sunday 2026-08-02 runs 07-27..08-02', () => {
    const keys = weekDateKeys('2026-08-02', 1)
    expect(keys).toHaveLength(7)
    expect(keys[0]).toBe('2026-07-27')
    expect(keys[6]).toBe('2026-08-02')
  })

  it('an anchor on the week start returns that same week', () => {
    expect(weekDateKeys('2026-08-03', 1)).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
      '2026-08-09',
    ])
  })

  it('respects a Sunday week start', () => {
    const keys = weekDateKeys('2026-08-05', 0)
    expect(keys[0]).toBe('2026-08-02')
    expect(keys[6]).toBe('2026-08-08')
  })
})
