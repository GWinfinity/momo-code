/**
 * Record/object utility functions.
 */

/**
 * Check if a value is a plain object record.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Check if a value is a non-null object.
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
