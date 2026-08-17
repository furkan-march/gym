import { db } from '../../../lib/db'
import { LEGACY_TEMPLATE_IDS } from '../../../lib/seed/seed'
import { DEFAULT_TEMPLATE_ID_LIST, buildDefaultProgram } from './defaultProgram'

/**
 * "Restore defaults" (SPEC 27): puts the three default templates, their
 * exercises, the 7-day schedule, AND the default exercise library back to the
 * seeded program.
 *
 * - Default rows are upserted (bulkPut), so user edits to them are overwritten;
 *   this also delivers newly added default exercises to existing installs.
 * - Template exercises the user ADDED to a default template are deleted first,
 *   so the restored template contains exactly the seeded exercises.
 * - Custom templates, custom exercises, and their history are untouched
 *   (though the schedule is reset to the default weekday assignments).
 * - History is untouched: sessions snapshot their prescriptions (SPEC 5/29).
 */
export async function restoreDefaultProgram(): Promise<void> {
  const { exercises, variants, templates, templateExercises, scheduledDays } =
    buildDefaultProgram()
  await db.transaction(
    'rw',
    [db.exercises, db.exerciseVariants, db.workoutTemplates, db.templateExercises, db.scheduledDays],
    async () => {
      // Retire pre-revision default templates (history keeps its own snapshots).
      await db.templateExercises.where('templateId').anyOf([...LEGACY_TEMPLATE_IDS]).delete()
      await db.workoutTemplates.bulkDelete([...LEGACY_TEMPLATE_IDS])
      await db.templateExercises.where('templateId').anyOf(DEFAULT_TEMPLATE_ID_LIST).delete()
      await db.exercises.bulkPut(exercises)
      await db.exerciseVariants.bulkPut(variants)
      await db.workoutTemplates.bulkPut(templates)
      await db.templateExercises.bulkPut(templateExercises)
      await db.scheduledDays.bulkPut(scheduledDays)
    },
  )
}
