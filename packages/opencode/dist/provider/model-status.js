/**
 * Model status enumeration for the momo Code provider system.
 * Tracks the availability and lifecycle state of each model.
 */
export var ModelStatus;
(function (ModelStatus) {
    /** Model is fully available and ready for use. */
    ModelStatus["Available"] = "available";
    /** Model is currently unavailable (e.g., provider downtime). */
    ModelStatus["Unavailable"] = "unavailable";
    /** Model is deprecated and should not be used for new sessions. */
    ModelStatus["Deprecated"] = "deprecated";
    /** Model is experimental and may have limited availability. */
    ModelStatus["Experimental"] = "experimental";
})(ModelStatus || (ModelStatus = {}));
//# sourceMappingURL=model-status.js.map