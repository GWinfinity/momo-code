/**
 * Record/object utility functions.
 */
/**
 * Check if a value is a plain object record.
 */
export function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
 * Check if a value is a non-null object.
 */
export function isObject(value) {
    return typeof value === "object" && value !== null;
}
//# sourceMappingURL=record.js.map