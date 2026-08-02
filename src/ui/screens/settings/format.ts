/** Small display formatters local to the Settings screen. */

/** Kilogram (or any numeric) value at the configured decimal precision. */
export function fmtNum(value: number, precision: 1 | 2): string {
  return value.toFixed(precision)
}

/** Bytes as megabytes with 1 decimal, e.g. "12.4 MB". */
export function fmtMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** "workoutSessions" -> "workout sessions" for the import preview list. */
export function humanTableName(table: string): string {
  return table.replace(/([A-Z])/g, ' $1').toLowerCase().trim()
}
