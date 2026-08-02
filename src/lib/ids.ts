/** Stable unique id. crypto.randomUUID is available in all target environments. */
export function newId(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}
