import type { Table } from 'dexie'
import type { GymDB } from '../db'
import { addDaysKey, fromDateKey, weekdayOfKey } from '../dates'
import { epley } from '../engines/e1rm'
import { EX, TEMPLATE_IDS } from './seed'
import type {
  BodyMetric,
  CardioSession,
  DailyActivity,
  DateKey,
  EquipmentContext,
  Exercise,
  ExerciseSession,
  ExerciseVariant,
  PersonalRecord,
  PostureRoutineLog,
  SetLog,
  TemplateExercise,
  WorkoutSession,
  WorkoutTemplate,
} from '../types'

/**
 * Demo data (SPEC 34): four weeks of plausible, honest history strictly BEFORE
 * `today`, following the seeded weekly schedule (Sun Lower, Tue Upper A,
 * Thu Upper B). Fully deterministic: a seeded LCG derived from `today` replaces
 * Math.random, and every timestamp is derived from the day's DateKey — no
 * Date.now() anywhere. Every record carries isDemo: true.
 *
 * Includes, per SPEC 34: progressive-overload load increases, three personal
 * records, a fatigue-shaped decline (Overhead Press: same load, declining reps
 * across the last three sessions), bodyweight Pull-Up sessions, per-side
 * Bulgarian Split Squat / Pallof Press sets, and Chest-Supported Row logged
 * under two different equipment contexts (Upper A vs Upper B machine).
 */

export const DEMO_CONTEXT_IDS = {
  rowHammer: 'demo-ctx-row-hammer',
  rowPlate: 'demo-ctx-row-plate',
} as const

const DEMO_DAYS = 28
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

// --- deterministic pseudo-random (FNV-1a seed + LCG) -----------------------

function seedFromString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  }
  return h >>> 0
}

/** Numerical Recipes LCG; returns values in [0, 1). */
function makeLcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

// --- small helpers ---------------------------------------------------------

function pick<T>(arr: readonly T[], i: number): T {
  const v = arr[Math.min(Math.max(i, 0), arr.length - 1)]
  if (v === undefined) throw new Error('demo: picked from an empty table')
  return v
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

function roundToIncrement(x: number, incrementKg: number): number {
  const inc = incrementKg > 0 ? incrementKg : 2.5
  return Math.round((Math.round(x / inc) * inc) * 100) / 100
}

function atMinutes(key: DateKey, minutesFromMidnight: number): Date {
  return new Date(fromDateKey(key).getTime() + minutesFromMidnight * 60_000)
}

// --- deterministic training plan over the four demo weeks ------------------

/** Working load per week index 0..3 (progressive overload examples). */
const LOADS: Record<string, readonly [number, number, number, number]> = {
  [EX.benchPress]: [57.5, 60, 62.5, 65],
  [EX.inclineDbPress]: [26, 26, 28, 28], // per dumbbell
  [EX.chestSupportedRow]: [50, 52.5, 52.5, 55], // Upper A machine (Hammer)
  [EX.lateralRaise]: [8, 8, 9, 9],
  [EX.facePull]: [25, 25, 27.5, 27.5],
  [EX.ropePushdown]: [25, 25, 25, 27.5],
  [EX.dumbbellCurl]: [12, 12, 12, 14],
  [EX.overheadPress]: [40, 40, 40, 40], // fatigue example: load never moves
  [EX.inclineMachinePress]: [40, 42.5, 45, 45],
  [EX.latPulldown]: [55, 57.5, 57.5, 60],
  [EX.rearDeltFly]: [10, 10, 11, 11],
  [EX.cableYRaise]: [7, 7, 8, 8],
  [EX.hammerCurl]: [12, 12, 14, 14],
  [EX.overheadRopeExt]: [20, 20, 22.5, 22.5],
  [EX.squat]: [70, 72.5, 75, 77.5],
  [EX.romanianDeadlift]: [80, 82.5, 85, 87.5],
  // Building-gym defaults (2026-08-03 program revision)
  [EX.dbBenchPress]: [30, 32, 32, 34], // per dumbbell
  [EX.smithSquat]: [60, 62.5, 65, 67.5],
  [EX.smithInclinePress]: [35, 37.5, 40, 40],
  [EX.dbRomanianDeadlift]: [28, 30, 32, 32], // per dumbbell
  [EX.dbLegCurl]: [12, 12, 14, 14],
  [EX.cableRow]: [50, 52.5, 52.5, 55],
  [EX.hipThrust]: [40, 42.5, 45, 45],
  [EX.bulgarianSplitSquat]: [10, 10, 12, 12], // per dumbbell, per side
  [EX.legCurl]: [35, 37.5, 37.5, 40],
  [EX.standingCalfRaise]: [50, 50, 55, 55],
  [EX.pallofPress]: [10, 10, 11, 11],
}

/** Upper B logs the same row exercise on a different machine (context demo). */
const ROW_PLATE_LOADS: readonly [number, number, number, number] = [55, 57.5, 60, 60]

/** Same 40 kg every week, total reps 16 -> 15 -> 14 -> 13: fatigue shape
 * (Push A prescribes 2 OHP sets in the 6-day program). */
const OHP_REPS: readonly (readonly number[])[] = [
  [8, 8],
  [8, 7],
  [7, 7],
  [7, 6],
]

/** Bodyweight pull-up rep progression (best set 9 from week 2). */
const PULLUP_REPS: readonly (readonly number[])[] = [
  [8, 7, 7, 6],
  [8, 8, 7, 7],
  [9, 8, 8, 7],
  [9, 9, 8, 8],
]

interface DemoBatch {
  equipmentContexts: EquipmentContext[]
  workoutSessions: WorkoutSession[]
  exerciseSessions: ExerciseSession[]
  setLogs: SetLog[]
  bodyMetrics: BodyMetric[]
  dailyActivities: DailyActivity[]
  cardioSessions: CardioSession[]
  postureRoutineLogs: PostureRoutineLog[]
  personalRecords: PersonalRecord[]
}

interface SeedLookups {
  templatesById: Map<string, WorkoutTemplate>
  texByTemplate: Map<string, TemplateExercise[]>
  exercisesById: Map<string, Exercise>
  variantsById: Map<string, ExerciseVariant>
}

async function readSeedLookups(db: GymDB): Promise<SeedLookups> {
  const templateIds = [
    TEMPLATE_IDS.pushA,
    TEMPLATE_IDS.pullA,
    TEMPLATE_IDS.legsA,
    TEMPLATE_IDS.pushB,
    TEMPLATE_IDS.pullB,
    TEMPLATE_IDS.legsB,
  ]
  const templates = await db.workoutTemplates.bulkGet(templateIds)
  const templatesById = new Map<string, WorkoutTemplate>()
  templates.forEach((t) => {
    if (t) templatesById.set(t.id, t)
  })
  if (templatesById.size !== templateIds.length) {
    throw new Error('Demo data requires the default seed. Run seedDefaults() first.')
  }
  const texRows = await db.templateExercises.where('templateId').anyOf(templateIds).toArray()
  const texByTemplate = new Map<string, TemplateExercise[]>()
  for (const tex of texRows) {
    const list = texByTemplate.get(tex.templateId) ?? []
    list.push(tex)
    texByTemplate.set(tex.templateId, list)
  }
  for (const list of texByTemplate.values()) list.sort((a, b) => a.orderIndex - b.orderIndex)
  const exercisesById = new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
  const variantsById = new Map((await db.exerciseVariants.toArray()).map((v) => [v.id, v]))
  return { templatesById, texByTemplate, exercisesById, variantsById }
}

function buildStrengthSession(
  out: DemoBatch,
  lookups: SeedLookups,
  templateId: string,
  dateKey: DateKey,
  week: number,
  bodyweightKg: number,
  rng: () => number,
): void {
  const template = lookups.templatesById.get(templateId)
  const texList = lookups.texByTemplate.get(templateId)
  if (!template || !texList || texList.length === 0) {
    throw new Error(`Demo data: template ${templateId} is not seeded`)
  }

  const sessionId = `demo-ws-${dateKey}`
  const start = atMinutes(dateKey, 18 * 60 + Math.floor(rng() * 30))
  const startIso = start.toISOString()
  const setSpacingMs = (100 + Math.floor(rng() * 40)) * 1000
  let clockMs = start.getTime()

  for (const tex of texList) {
    const exercise = lookups.exercisesById.get(tex.exerciseId)
    if (!exercise) throw new Error(`Demo data: exercise ${tex.exerciseId} is not seeded`)

    const variant = tex.defaultVariantId ? lookups.variantsById.get(tex.defaultVariantId) : undefined
    // SPEC 34 machine-context example: the same row exercise on two machines
    // (Hammer weeks 0-1, plate-loaded weeks 2-3 — Upper B's row is a cable row
    // since the 2026-08-03 building-gym revision, so both contexts live on
    // Upper A's chest-supported row).
    const equipmentContextId =
      tex.exerciseId === EX.chestSupportedRow
        ? week < 2
          ? DEMO_CONTEXT_IDS.rowHammer
          : DEMO_CONTEXT_IDS.rowPlate
        : null

    // One plausible "ran long, dropped the last exercise" example.
    const skipped = tex.exerciseId === EX.pallofPress && week === 1

    const exerciseSessionId = `demo-es-${dateKey}-${tex.id}`
    const setLogs: SetLog[] = []

    if (!skipped) {
      const isBodyweight = exercise.kind === 'bodyweight'
      const isRepsOnly = exercise.kind === 'repsOnly'
      let workingLoad: number | null = null
      if (!isBodyweight && !isRepsOnly) {
        if (tex.exerciseId === EX.chestSupportedRow && week >= 2) {
          workingLoad = pick(ROW_PLATE_LOADS, week)
        } else {
          const plan = LOADS[tex.exerciseId]
          if (!plan) throw new Error(`Demo data: no load plan for ${tex.exerciseId}`)
          workingLoad = pick(plan, week)
        }
      }
      const incrementKg =
        tex.incrementKg ?? (exercise.defaultIncrementKg > 0 ? exercise.defaultIncrementKg : 2.5)

      let orderIndex = 0
      const pushSet = (partial: {
        loadKg: number | null
        reps: number
        rir: number | null
        isWarmup: boolean
        side: SetLog['side']
        bodyweightMode: SetLog['bodyweightMode']
      }): void => {
        clockMs += setSpacingMs
        const completedIso = new Date(clockMs).toISOString()
        setLogs.push({
          id: `demo-set-${dateKey}-${tex.id}-${orderIndex}`,
          workoutSessionId: sessionId,
          exerciseSessionId,
          exerciseId: tex.exerciseId,
          variantId: tex.defaultVariantId,
          equipmentContextId,
          loadKg: partial.loadKg,
          reps: partial.reps,
          rir: partial.rir,
          completed: true,
          isWarmup: partial.isWarmup,
          side: partial.side,
          bodyweightMode: partial.bodyweightMode,
          addedWeightKg: null,
          assistanceWeightKg: null,
          loadConvention: exercise.loadConvention,
          orderIndex,
          completedAt: completedIso,
          formQuality: null,
          painFlag: false,
          isDemo: true,
          createdAt: completedIso,
          updatedAt: completedIso,
        })
        orderIndex += 1
      }

      // Ramp-up sets for the seeded schemes (flagged isWarmup, RIR not logged).
      for (const step of tex.rampScheme) {
        if (isBodyweight || step.pct <= 0) {
          pushSet({
            loadKg: null,
            reps: step.reps,
            rir: null,
            isWarmup: true,
            side: null,
            bodyweightMode: 'bodyweight',
          })
        } else if (workingLoad != null) {
          pushSet({
            loadKg: roundToIncrement(step.pct * workingLoad, incrementKg),
            reps: step.reps,
            rir: null,
            isWarmup: true,
            side: null,
            bodyweightMode: 'none',
          })
        }
      }

      const repsForSet = (setIdx: number): number => {
        if (tex.exerciseId === EX.overheadPress) return pick(pick(OHP_REPS, week), setIdx)
        if (tex.exerciseId === EX.pullUp) return pick(pick(PULLUP_REPS, week), setIdx)
        if (isRepsOnly) return Math.min(tex.repRangeMax, tex.repRangeMin + week)
        const drop = setIdx >= 2 && rng() < 0.4 ? 1 : 0
        return Math.max(tex.repRangeMin, tex.repRangeMax - drop)
      }
      const rirForSet = (): number | null =>
        rng() < 0.1 ? null : rng() < 0.5 ? 1 : 2

      for (let setIdx = 0; setIdx < tex.prescribedSets; setIdx++) {
        const reps = repsForSet(setIdx)
        if (exercise.unilateral) {
          // One round = left then right back-to-back (SPEC 8).
          const rightDrop = rng() < 0.25 ? 1 : 0
          const rir = rirForSet()
          pushSet({
            loadKg: workingLoad,
            reps,
            rir,
            isWarmup: false,
            side: 'left',
            bodyweightMode: 'none',
          })
          pushSet({
            loadKg: workingLoad,
            reps: Math.max(tex.repRangeMin, reps - rightDrop),
            rir,
            isWarmup: false,
            side: 'right',
            bodyweightMode: 'none',
          })
        } else {
          pushSet({
            loadKg: isBodyweight ? null : workingLoad,
            reps,
            rir: rirForSet(),
            isWarmup: false,
            side: null,
            bodyweightMode: isBodyweight ? 'bodyweight' : 'none',
          })
        }
      }
      clockMs += 60_000 // transition to the next exercise
    }

    const lastSet = setLogs[setLogs.length - 1]
    const esUpdated = lastSet?.completedAt ?? startIso
    out.exerciseSessions.push({
      id: exerciseSessionId,
      workoutSessionId: sessionId,
      exerciseId: tex.exerciseId,
      variantId: tex.defaultVariantId,
      equipmentContextId,
      exerciseName: exercise.name,
      variantName: variant?.name ?? null,
      status: skipped ? 'skipped' : 'completed',
      orderIndex: tex.orderIndex,
      isUnplanned: false,
      substitutedByExerciseSessionId: null,
      substitutedFromExerciseSessionId: null,
      prescription: {
        prescribedSets: tex.prescribedSets,
        repRangeMin: tex.repRangeMin,
        repRangeMax: tex.repRangeMax,
        targetRIRMin: tex.targetRIRMin,
        targetRIRMax: tex.targetRIRMax,
        restSeconds: tex.restSeconds,
        incrementKg: tex.incrementKg ?? exercise.defaultIncrementKg,
        isOptional: tex.isOptional,
        supersetGroup: tex.supersetGroup,
      },
      isDemo: true,
      createdAt: startIso,
      updatedAt: esUpdated,
    })
    out.setLogs.push(...setLogs)
  }

  const finish = new Date(clockMs + 180_000)
  const elapsedSeconds = Math.floor((finish.getTime() - start.getTime()) / 1000)
  const idleSeconds = 120 + Math.floor(rng() * 300)
  out.workoutSessions.push({
    id: sessionId,
    templateId: template.id,
    templateName: template.name,
    templateKind: template.kind,
    dateKey,
    startedAt: startIso,
    finishedAt: finish.toISOString(),
    status: 'completed',
    bodyweightAtSessionKg: bodyweightKg,
    activeSeconds: Math.max(0, elapsedSeconds - idleSeconds),
    lastActivatedAt: null,
    isDemo: true,
    createdAt: startIso,
    updatedAt: finish.toISOString(),
  })
}

function buildPersonalRecords(out: DemoBatch): void {
  const sessionDateById = new Map(out.workoutSessions.map((s) => [s.id, s.dateKey]))
  const working = out.setLogs.filter((s) => !s.isWarmup && s.completed)
  const pr = (
    id: string,
    kind: PersonalRecord['kind'],
    set: SetLog,
    value: number,
    secondaryValue: number | null,
  ): PersonalRecord => ({
    id,
    exerciseId: set.exerciseId,
    variantId: set.variantId,
    equipmentContextId: set.equipmentContextId,
    kind,
    value,
    secondaryValue,
    setLogId: set.id,
    workoutSessionId: set.workoutSessionId,
    dateKey: sessionDateById.get(set.workoutSessionId) ?? '',
    isDemo: true,
    createdAt: set.completedAt ?? set.createdAt,
  })

  let benchBest: SetLog | null = null
  let pullupBest: SetLog | null = null
  let squatBest: SetLog | null = null
  let squatBestE1rm = 0
  for (const s of working) {
    if (s.exerciseId === EX.dbBenchPress && s.loadKg != null) {
      if (benchBest?.loadKg == null || s.loadKg >= benchBest.loadKg) benchBest = s
    }
    if (s.exerciseId === EX.pullUp && s.reps != null) {
      if (pullupBest?.reps == null || s.reps > pullupBest.reps) pullupBest = s
    }
    if (s.exerciseId === EX.smithSquat && s.loadKg != null && s.reps != null && s.reps <= 12) {
      const e = epley(s.loadKg, s.reps)
      if (e > squatBestE1rm) {
        squatBestE1rm = e
        squatBest = s
      }
    }
  }
  if (benchBest?.loadKg != null) {
    out.personalRecords.push(
      pr('demo-pr-bench-heaviest', 'heaviestLoad', benchBest, benchBest.loadKg, benchBest.reps),
    )
  }
  if (pullupBest?.reps != null) {
    out.personalRecords.push(
      pr('demo-pr-pullup-bw-reps', 'bodyweightReps', pullupBest, pullupBest.reps, null),
    )
  }
  if (squatBest) {
    out.personalRecords.push(
      pr('demo-pr-squat-e1rm', 'best1RM', squatBest, round1(squatBestE1rm), squatBest.loadKg),
    )
  }
}

/**
 * Load four weeks of demo history ending the day before `today`.
 * Idempotent for a given `today` (deterministic ids + bulkPut).
 * Does NOT flip AppSettings.demoDataEnabled — the Settings UI owns that flag.
 */
export async function loadDemoData(db: GymDB, today: DateKey): Promise<void> {
  if (!DATE_KEY_RE.test(today)) throw new Error(`Invalid DateKey: ${today}`)
  const lookups = await readSeedLookups(db)
  const rng = makeLcg(seedFromString(`gym-demo-${today}`))
  const startKey = addDaysKey(today, -DEMO_DAYS)

  const out: DemoBatch = {
    equipmentContexts: [],
    workoutSessions: [],
    exerciseSessions: [],
    setLogs: [],
    bodyMetrics: [],
    dailyActivities: [],
    cardioSessions: [],
    postureRoutineLogs: [],
    personalRecords: [],
  }

  const ctxCreated = atMinutes(startKey, 10 * 60).toISOString()
  out.equipmentContexts.push(
    {
      id: DEMO_CONTEXT_IDS.rowHammer,
      gym: 'Main Gym',
      machineName: 'Hammer Strength Iso Row',
      seatSetting: '4',
      isDemo: true,
      createdAt: ctxCreated,
      updatedAt: ctxCreated,
    },
    {
      id: DEMO_CONTEXT_IDS.rowPlate,
      gym: 'Main Gym',
      machineName: 'Plate-Loaded Row',
      seatSetting: '2',
      note: 'Feels heavier than the Hammer machine at the same load',
      isDemo: true,
      createdAt: ctxCreated,
      updatedAt: ctxCreated,
    },
  )

  const weightFor = (i: number): number => 87.5 - (1.1 * i) / (DEMO_DAYS - 1)
  let fridayCount = 0

  for (let i = 0; i < DEMO_DAYS; i++) {
    const key = addDaysKey(startKey, i)
    const weekday = weekdayOfKey(key)
    const week = Math.floor(i / 7)

    // Body metrics: daily weigh-ins trending 87.5 -> 86.4 with noise, exact at
    // both endpoints; waist weekly.
    const isEndpoint = i === 0 || i === DEMO_DAYS - 1
    const noise = (rng() - 0.5) * 0.4
    const skipWeighIn = !isEndpoint && rng() < 0.12
    const weightKg = isEndpoint
      ? i === 0
        ? 87.5
        : 86.4
      : round1(weightFor(i) + noise)
    const waistCm = i % 7 === 0 ? round1(96 - 0.5 * week) : null
    if (!skipWeighIn || waistCm != null) {
      const bmIso = atMinutes(key, 7 * 60 + 30).toISOString()
      out.bodyMetrics.push({
        id: `demo-bm-${key}`,
        dateKey: key,
        weightKg: skipWeighIn ? null : weightKg,
        waistCm,
        bodyFatPct: null,
        isDemo: true,
        createdAt: bmIso,
        updatedAt: bmIso,
      })
    }

    // Steps every day.
    const daIso = atMinutes(key, 21 * 60).toISOString()
    out.dailyActivities.push({
      id: `demo-da-${key}`,
      dateKey: key,
      steps: 7000 + Math.floor(rng() * 45) * 100,
      isDemo: true,
      createdAt: daIso,
      updatedAt: daIso,
    })

    // Strength sessions follow the seeded 6-day schedule (Sunday rest).
    const templateForWeekday: Record<number, string | undefined> = {
      1: TEMPLATE_IDS.pushA,
      2: TEMPLATE_IDS.pullA,
      3: TEMPLATE_IDS.legsA,
      4: TEMPLATE_IDS.pushB,
      5: TEMPLATE_IDS.pullB,
      6: TEMPLATE_IDS.legsB,
    }
    const templateId = templateForWeekday[weekday]
    if (templateId) {
      buildStrengthSession(out, lookups, templateId, key, week, round1(weightFor(i)), rng)
    }

    // Morning cardio examples: Monday easy run (Z2), Wednesday bike (Z2),
    // Friday tempo run (quality, not Z2). 20-minute slots.
    if (weekday === 1 || weekday === 3 || weekday === 5) {
      const cIso = atMinutes(key, 7 * 60).toISOString()
      out.cardioSessions.push({
        id: `demo-cardio-${key}`,
        dateKey: key,
        type: weekday === 3 ? 'stationaryBike' : 'run',
        minutes: 20,
        distanceKm: weekday === 3 ? null : round1(2.6 + rng()),
        avgHeartRate: weekday === 5 ? 158 + Math.floor(rng() * 8) : 132 + Math.floor(rng() * 8),
        perceivedIntensity: weekday === 5 ? 4 : 2,
        isZone2: weekday !== 5,
        isDemo: true,
        createdAt: cIso,
        updatedAt: cIso,
      })
    }

    // Posture routine on required days (Mon/Fri); one Friday left incomplete.
    if (weekday === 1 || weekday === 5) {
      if (weekday === 5) fridayCount += 1
      const incomplete = weekday === 5 && fridayCount === 2
      const items = incomplete
        ? ['po-1', 'po-2', 'po-3', 'po-4']
        : ['po-1', 'po-2', 'po-3', 'po-4', 'po-5']
      const pIso = atMinutes(key, 20 * 60).toISOString()
      out.postureRoutineLogs.push({
        id: `demo-po-${key}`,
        dateKey: key,
        completedItemIds: items,
        totalItems: 5,
        isDemo: true,
        createdAt: pIso,
        updatedAt: pIso,
      })
    }
  }

  buildPersonalRecords(out)

  await db.transaction(
    'rw',
    [
      db.equipmentContexts,
      db.workoutSessions,
      db.exerciseSessions,
      db.setLogs,
      db.bodyMetrics,
      db.dailyActivities,
      db.cardioSessions,
      db.postureRoutineLogs,
      db.personalRecords,
    ],
    async () => {
      await db.equipmentContexts.bulkPut(out.equipmentContexts)
      await db.workoutSessions.bulkPut(out.workoutSessions)
      await db.exerciseSessions.bulkPut(out.exerciseSessions)
      await db.setLogs.bulkPut(out.setLogs)
      await db.bodyMetrics.bulkPut(out.bodyMetrics)
      await db.dailyActivities.bulkPut(out.dailyActivities)
      await db.cardioSessions.bulkPut(out.cardioSessions)
      await db.postureRoutineLogs.bulkPut(out.postureRoutineLogs)
      await db.personalRecords.bulkPut(out.personalRecords)
    },
  )
}

/**
 * Delete ONLY isDemo rows across all tables in one transaction (SPEC 34).
 * Uses .filter() rather than the isDemo index: IndexedDB cannot index boolean
 * keys, so `where('isDemo').equals(true)` would never match.
 */
export async function clearDemoData(db: GymDB): Promise<void> {
  const tables = [
    db.exercises,
    db.exerciseVariants,
    db.equipmentContexts,
    db.workoutTemplates,
    db.templateExercises,
    db.workoutSessions,
    db.exerciseSessions,
    db.setLogs,
    db.readinessLogs,
    db.sessionFeedbacks,
    db.bodyMetrics,
    db.dailyActivities,
    db.cardioSessions,
    db.postureRoutineLogs,
    db.nutritionAdherenceLogs,
    db.mealTemplates,
    db.weeklyCheckIns,
    db.personalRecords,
  ] as unknown as Table<{ isDemo?: boolean }, string>[]
  await db.transaction('rw', tables, async () => {
    for (const table of tables) {
      await table.filter((row) => row.isDemo === true).delete()
    }
  })
}
