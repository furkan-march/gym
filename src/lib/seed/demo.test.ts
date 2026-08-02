import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { addDaysKey, weekdayOfKey } from '../dates'
import { EX, seedDefaults } from './seed'
import { DEMO_CONTEXT_IDS, clearDemoData, loadDemoData } from './demo'
import type { SetLog } from '../types'

// 2026-08-01 is a Saturday; the demo window is 2026-07-04 .. 2026-07-31.
const TODAY = '2026-08-01'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await seedDefaults()
})

function workingSets(sets: SetLog[]): SetLog[] {
  return sets.filter((s) => !s.isWarmup)
}

describe('loadDemoData', () => {
  it('requires the default seed', async () => {
    await db.delete()
    await db.open()
    await expect(loadDemoData(db, TODAY)).rejects.toThrow(/seed/i)
  })

  it('rejects an invalid DateKey', async () => {
    await expect(loadDemoData(db, 'August 1st')).rejects.toThrow(/DateKey/)
  })

  it('creates four weeks of schedule-following history strictly before today', async () => {
    await loadDemoData(db, TODAY)
    const sessions = await db.workoutSessions.toArray()
    expect(sessions).toHaveLength(12) // 4 Sundays + 4 Tuesdays + 4 Thursdays
    for (const s of sessions) {
      expect(s.dateKey < TODAY).toBe(true)
      expect(s.dateKey >= addDaysKey(TODAY, -28)).toBe(true)
      expect(s.status).toBe('completed')
      const weekday = weekdayOfKey(s.dateKey)
      if (weekday === 0) expect(s.templateKind).toBe('lower')
      if (weekday === 2) expect(s.templateKind).toBe('upperA')
      if (weekday === 4) expect(s.templateKind).toBe('upperB')
      expect([0, 2, 4]).toContain(weekday)
    }
    // Full prescription snapshots on every exercise session.
    const exSessions = await db.exerciseSessions.toArray()
    expect(exSessions).toHaveLength(4 * 8 + 4 * 8 + 4 * 7)
    for (const es of exSessions) {
      expect(es.prescription.prescribedSets).toBeGreaterThan(0)
      expect(es.prescription.incrementKg).toBeGreaterThanOrEqual(0)
      expect(es.exerciseName.length).toBeGreaterThan(0)
    }
    expect(exSessions.filter((es) => es.status === 'skipped')).toHaveLength(1)
  })

  it('marks every record isDemo: true in every table it writes', async () => {
    await loadDemoData(db, TODAY)
    const tables = [
      db.equipmentContexts,
      db.workoutSessions,
      db.exerciseSessions,
      db.setLogs,
      db.bodyMetrics,
      db.dailyActivities,
      db.cardioSessions,
      db.postureRoutineLogs,
      db.personalRecords,
    ]
    for (const table of tables) {
      const rows = (await table.toArray()) as { isDemo?: boolean }[]
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every((r) => r.isDemo === true)).toBe(true)
    }
  })

  it('is deterministic and idempotent: reloading changes nothing', async () => {
    await loadDemoData(db, TODAY)
    const before = {
      sessions: await db.workoutSessions.count(),
      sets: await db.setLogs.count(),
      metrics: await db.bodyMetrics.count(),
      firstSet: await db.setLogs.orderBy('id').first(),
    }
    await loadDemoData(db, TODAY)
    expect(await db.workoutSessions.count()).toBe(before.sessions)
    expect(await db.setLogs.count()).toBe(before.sets)
    expect(await db.bodyMetrics.count()).toBe(before.metrics)
    expect(await db.setLogs.orderBy('id').first()).toEqual(before.firstSet)
  })

  it('body weight trends 87.5 -> 86.4 with noise, plus weekly waist entries', async () => {
    await loadDemoData(db, TODAY)
    const metrics = (await db.bodyMetrics.toArray()).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey),
    )
    expect(metrics.length).toBeGreaterThanOrEqual(20)
    expect(metrics[0]?.dateKey).toBe(addDaysKey(TODAY, -28))
    expect(metrics[0]?.weightKg).toBe(87.5)
    const last = metrics[metrics.length - 1]
    expect(last?.dateKey).toBe(addDaysKey(TODAY, -1))
    expect(last?.weightKg).toBe(86.4)
    for (const m of metrics) {
      if (m.weightKg != null) {
        expect(m.weightKg).toBeGreaterThan(85.5)
        expect(m.weightKg).toBeLessThan(88.5)
      }
    }
    expect(metrics.filter((m) => m.waistCm != null).length).toBeGreaterThanOrEqual(3)
  })

  it('logs steps daily and cardio on Zone 2 / walk days', async () => {
    await loadDemoData(db, TODAY)
    const steps = await db.dailyActivities.toArray()
    expect(steps).toHaveLength(28)
    for (const d of steps) {
      expect(d.steps).toBeGreaterThanOrEqual(7000)
      expect(d.steps).toBeLessThanOrEqual(11500)
    }
    const cardio = await db.cardioSessions.toArray()
    expect(cardio).toHaveLength(8) // 4 Wednesdays + 4 Saturdays
    const zone2 = cardio.filter((c) => c.isZone2)
    expect(zone2).toHaveLength(4)
    for (const c of zone2) {
      expect(weekdayOfKey(c.dateKey)).toBe(3)
      expect(c.minutes).toBeGreaterThanOrEqual(30)
      expect(c.minutes).toBeLessThanOrEqual(40)
    }
  })

  it('logs the posture routine on required days with one incomplete example', async () => {
    await loadDemoData(db, TODAY)
    const logs = await db.postureRoutineLogs.toArray()
    expect(logs).toHaveLength(8) // 4 Mondays + 4 Fridays
    for (const log of logs) {
      expect([1, 5]).toContain(weekdayOfKey(log.dateKey))
      expect(log.totalItems).toBe(5)
    }
    expect(logs.filter((l) => l.completedItemIds.length < l.totalItems)).toHaveLength(1)
  })

  it('creates at least two personal records tied to real demo sets', async () => {
    await loadDemoData(db, TODAY)
    const prs = await db.personalRecords.toArray()
    expect(prs.length).toBeGreaterThanOrEqual(2)
    const kinds = prs.map((p) => p.kind)
    expect(kinds).toContain('heaviestLoad')
    expect(kinds).toContain('bodyweightReps')
    for (const p of prs) {
      expect(p.setLogId).not.toBeNull()
      const set = await db.setLogs.get(p.setLogId as string)
      expect(set).toBeDefined()
      expect(set?.isWarmup).toBe(false)
      const session = await db.workoutSessions.get(p.workoutSessionId)
      expect(session?.dateKey).toBe(p.dateKey)
    }
    const bench = prs.find((p) => p.kind === 'heaviestLoad')
    expect(bench?.exerciseId).toBe(EX.benchPress)
    expect(bench?.value).toBe(65)
  })

  it('shapes a fatigue warning: Overhead Press same load, reps declining over 3 sessions', async () => {
    await loadDemoData(db, TODAY)
    const ohpSets = workingSets(
      await db.setLogs.where('exerciseId').equals(EX.overheadPress).toArray(),
    )
    expect(ohpSets.every((s) => s.loadKg === 40)).toBe(true)
    const totalsBySession = new Map<string, number>()
    for (const s of ohpSets) {
      totalsBySession.set(
        s.workoutSessionId,
        (totalsBySession.get(s.workoutSessionId) ?? 0) + (s.reps ?? 0),
      )
    }
    const sessions = await db.workoutSessions.bulkGet([...totalsBySession.keys()])
    const ordered = [...totalsBySession.entries()]
      .map(([id, total]) => ({
        total,
        dateKey: sessions.find((ws) => ws?.id === id)?.dateKey ?? '',
      }))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .map((x) => x.total)
    expect(ordered).toHaveLength(4)
    const lastThree = ordered.slice(1)
    expect(lastThree[0]).toBeGreaterThan(lastThree[1] as number)
    expect(lastThree[1]).toBeGreaterThan(lastThree[2] as number)
  })

  it('logs pull-ups as bodyweight sets, with a warm-up ramp flagged isWarmup', async () => {
    await loadDemoData(db, TODAY)
    const pullups = await db.setLogs.where('exerciseId').equals(EX.pullUp).toArray()
    expect(pullups.length).toBeGreaterThan(0)
    for (const s of pullups) {
      expect(s.bodyweightMode).toBe('bodyweight')
      expect(s.loadKg).toBeNull()
      expect(s.reps).toBeGreaterThan(0)
    }
    // Ramp sets exist and are excluded from working sets (bench: 3 per session).
    const benchWarmups = (
      await db.setLogs.where('exerciseId').equals(EX.benchPress).toArray()
    ).filter((s) => s.isWarmup)
    expect(benchWarmups).toHaveLength(12)
    expect(benchWarmups.every((s) => s.rir === null)).toBe(true)
  })

  it('tracks unilateral Bulgarian Split Squat sets per side, per round', async () => {
    await loadDemoData(db, TODAY)
    const bss = workingSets(
      await db.setLogs.where('exerciseId').equals(EX.bulgarianSplitSquat).toArray(),
    )
    const bySession = new Map<string, SetLog[]>()
    for (const s of bss) {
      const list = bySession.get(s.workoutSessionId) ?? []
      list.push(s)
      bySession.set(s.workoutSessionId, list)
    }
    expect(bySession.size).toBe(4)
    for (const sets of bySession.values()) {
      expect(sets.filter((s) => s.side === 'left')).toHaveLength(2)
      expect(sets.filter((s) => s.side === 'right')).toHaveLength(2)
      // Rounds alternate left then right (SPEC 8).
      const ordered = [...sets].sort((a, b) => a.orderIndex - b.orderIndex)
      expect(ordered.map((s) => s.side)).toEqual(['left', 'right', 'left', 'right'])
    }
  })

  it('logs Chest-Supported Row under two different equipment contexts', async () => {
    await loadDemoData(db, TODAY)
    const rows = await db.setLogs.where('exerciseId').equals(EX.chestSupportedRow).toArray()
    const contexts = new Set(rows.map((s) => s.equipmentContextId))
    expect(contexts).toEqual(new Set([DEMO_CONTEXT_IDS.rowHammer, DEMO_CONTEXT_IDS.rowPlate]))
    expect(await db.equipmentContexts.get(DEMO_CONTEXT_IDS.rowHammer)).toBeDefined()
    expect(await db.equipmentContexts.get(DEMO_CONTEXT_IDS.rowPlate)).toBeDefined()
  })
})

describe('clearDemoData', () => {
  it('removes only isDemo rows and leaves real data and the seed untouched', async () => {
    await loadDemoData(db, TODAY)

    // One real (non-demo) row per key table, inserted after the demo load.
    const t = '2026-08-01T10:00:00.000Z'
    await db.bodyMetrics.add({
      id: 'real-bm-1',
      dateKey: TODAY, // demo only uses earlier days, no unique-key clash
      weightKg: 86.2,
      waistCm: null,
      bodyFatPct: null,
      createdAt: t,
      updatedAt: t,
    })
    await db.workoutSessions.add({
      id: 'real-ws-1',
      templateId: null,
      templateName: 'Freestyle',
      templateKind: 'custom',
      dateKey: TODAY,
      startedAt: t,
      finishedAt: null,
      status: 'active',
      bodyweightAtSessionKg: 86.2,
      activeSeconds: 0,
      lastActivatedAt: t,
      createdAt: t,
      updatedAt: t,
    })

    await clearDemoData(db)

    // All demo rows gone.
    expect(await db.setLogs.count()).toBe(0)
    expect(await db.exerciseSessions.count()).toBe(0)
    expect(await db.equipmentContexts.count()).toBe(0)
    expect(await db.cardioSessions.count()).toBe(0)
    expect(await db.dailyActivities.count()).toBe(0)
    expect(await db.postureRoutineLogs.count()).toBe(0)
    expect(await db.personalRecords.count()).toBe(0)

    // Real rows survive.
    expect(await db.bodyMetrics.count()).toBe(1)
    expect((await db.bodyMetrics.get('real-bm-1'))?.weightKg).toBe(86.2)
    expect(await db.workoutSessions.count()).toBe(1)
    expect((await db.workoutSessions.get('real-ws-1'))?.status).toBe('active')

    // Seeded (non-demo) library and plan survive.
    expect(await db.exercises.count()).toBeGreaterThan(30)
    expect(await db.workoutTemplates.count()).toBe(3)
    expect(await db.templateExercises.count()).toBe(23)
    expect(await db.userProfile.get('profile')).toBeDefined()
  })

  it('is safe to run when no demo data exists', async () => {
    await expect(clearDemoData(db)).resolves.toBeUndefined()
    expect(await db.exercises.count()).toBeGreaterThan(30)
  })
})
