/**
 * Default supplement checklist entries (SPEC section 1 context; V2 feature).
 * The checklist is DISABLED by default, fully editable, makes no medical
 * claims, and carries no dosage text except the editable creatine reminder.
 * Kept in its own module (no db import) so both seedDefaults and the Dexie
 * version-2 upgrade can share it without a circular import.
 */
export const SUPPLEMENT_SEED: { id: string; name: string; reminderNote: string | null }[] = [
  { id: 'sup-multivitamin', name: 'Multivitamin', reminderNote: null },
  { id: 'sup-omega3', name: 'Omega-3', reminderNote: null },
  { id: 'sup-d3k2', name: 'Vitamin D3 + K2', reminderNote: null },
  { id: 'sup-magnesium', name: 'Magnesium', reminderNote: null },
  { id: 'sup-zinc', name: 'Zinc', reminderNote: null },
  { id: 'sup-vitc', name: 'Vitamin C', reminderNote: null },
  { id: 'sup-collagen', name: 'Type-2 Collagen', reminderNote: null },
  { id: 'sup-prebiotic', name: 'Prebiotic', reminderNote: null },
  { id: 'sup-creatine', name: 'Creatine', reminderNote: '3–5 g daily (editable reminder)' },
  { id: 'sup-whey', name: 'Whey Protein', reminderNote: null },
]
