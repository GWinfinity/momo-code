/**
 * Model groups for zero-config model selection.
 * Groups models by capability, cost, and provider for intelligent routing.
 */
import { BUILTIN_TIERS, BUILTIN_MODELS } from "./provider.js";
import { ModelStatus } from "./model-status.js";
/**
 * Built-in model groups for automatic selection.
 */
export const MODEL_GROUPS = [
    {
        id: "coding-complex",
        name: "Complex Coding Tasks",
        description: "Deep analysis, architecture, debugging complex issues",
        models: [
            ...BUILTIN_TIERS.ultra,
            ...BUILTIN_TIERS.standard,
        ],
        capabilities: ["coding", "analysis"],
        maxCostTier: "high",
    },
    {
        id: "coding-fast",
        name: "Fast Coding Tasks",
        description: "Quick edits, simple refactoring, code review",
        models: [
            ...BUILTIN_TIERS.lite,
            ...BUILTIN_TIERS.standard,
        ],
        capabilities: ["coding", "fast"],
        maxCostTier: "medium",
    },
    {
        id: "coding-long",
        name: "Long Context Tasks",
        description: "Large codebase analysis, multi-file operations",
        models: BUILTIN_MODELS.filter((m) => m.contextWindow > 500_000).map((m) => m.id),
        capabilities: ["coding", "long-context"],
        maxCostTier: "high",
    },
    {
        id: "default",
        name: "Default",
        description: "General purpose coding assistance",
        models: [
            ...BUILTIN_TIERS.standard,
            ...BUILTIN_TIERS.ultra,
            ...BUILTIN_TIERS.lite,
        ],
        capabilities: ["coding"],
        maxCostTier: "high",
    },
];
/**
 * Select the best model group for given capabilities.
 */
export function selectModelGroup(requiredCapabilities) {
    for (const group of MODEL_GROUPS) {
        const hasAllCapabilities = requiredCapabilities.every((cap) => group.capabilities.includes(cap));
        if (hasAllCapabilities) {
            return group;
        }
    }
    return MODEL_GROUPS[MODEL_GROUPS.length - 1];
}
/**
 * Get available models within a group, filtered by status.
 */
export function getAvailableModelsInGroup(group) {
    return group.models.filter((modelId) => {
        const model = BUILTIN_MODELS.find((m) => m.id === modelId);
        if (!model)
            return true; // Unknown models pass through
        return model.status === ModelStatus.Available;
    });
}
//# sourceMappingURL=model-groups.js.map