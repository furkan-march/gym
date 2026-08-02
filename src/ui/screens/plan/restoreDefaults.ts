import { db } from '../../../lib/db'
import { DEFAULT_TEMPLATE_ID_LIST, buildDefaultProgram } from './defaultProgram'

/**
 * "Restore defaults" (SPEC 27): puts the three default templates, their
 * exercises, and the 7-day schedule back to the seeded program.
 *
 * - Default-template rows are upserted (bulkPut), so user edits are overwritten.
 * - Template exercises the user ADDED to a default template are deleted first,
 *   so the restored template contains exactly the seeded exercises.
 * - Custom templates and their exercises are untouched (though the schedule is
 *   reset to the default weekday assignments).
 * - History is untouched: sessions snapshot their prescriptions (SPEC 5/29).
 */
export async function restoreDefaultProgram(): Promise<void> {
  const { templates, templateExercises, scheduledDays } = buildDefaultProgram()
  await db.transaction(
    'rw',
    [db.workoutTemplates, db.templateExercises, db.scheduledDays],
    async () => {
      await db.templateExercises.where('templateId').anyOf(DEFAULT_TEMPLATE_ID_LIST).delete()
      await db.workoutTemplates.bulkPut(templates)
      await db.templateExercises.bulkPut(templateExercises)
      await db.scheduledDays.bulkPut(scheduledDays)
    },
  )
}
