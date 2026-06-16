/**
 * Model groups for zero-config model selection.
 * Groups models by capability, cost, and provider for intelligent routing.
 */
/**
 * Model group for a specific use case.
 */
export interface ModelGroup {
    /** Group identifier. */
    readonly id: string;
    /** Human-readable name. */
    readonly name: string;
    /** Description of when to use this group. */
    readonly description: string;
    /** Model IDs in this group, in priority order. */
    readonly models: readonly string[];
    /** Required capabilities. */
    readonly capabilities: readonly string[];
    /** Maximum cost tier allowed. */
    readonly maxCostTier: "low" | "medium" | "high";
}
/**
 * Built-in model groups for automatic selection.
 */
export declare const MODEL_GROUPS: readonly ModelGroup[];
/**
 * Select the best model group for given capabilities.
 */
export declare function selectModelGroup(requiredCapabilities: readonly string[]): ModelGroup;
/**
 * Get available models within a group, filtered by status.
 */
export declare function getAvailableModelsInGroup(group: ModelGroup): readonly string[];
//# sourceMappingURL=model-groups.d.ts.map