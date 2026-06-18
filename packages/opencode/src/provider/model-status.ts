/**
 * Model status enumeration for the momo Code provider system.
 * Tracks the availability and lifecycle state of each model.
 */

export enum ModelStatus {
  /** Model is fully available and ready for use. */
  Available = "available",

  /** Model is currently unavailable (e.g., provider downtime). */
  Unavailable = "unavailable",

  /** Model is deprecated and should not be used for new sessions. */
  Deprecated = "deprecated",

  /** Model is experimental and may have limited availability. */
  Experimental = "experimental",
}
