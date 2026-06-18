/**
 * Model groups for zero-config model selection.
 * Groups models by capability, cost, and provider for intelligent routing.
 */

import { BUILTIN_TIERS, BUILTIN_MODELS } from "./provider"
import { ModelStatus } from "./model-status"

/**
 * Model group for a specific use case.
 */
export interface ModelGroup {
  /** Group identifier. */
  readonly id: string
  /** Human-readable name. */
  readonly name: string
  /** Description of when to use this group. */
  readonly description: string
  /** Model IDs in this group, in priority order. */
  readonly models: readonly string[]
  /** Required capabilities. */
  readonly capabilities: readonly string[]
  /** Maximum cost tier allowed. */
  readonly maxCostTier: "low" | "medium" | "high"
}

/**
 * Built-in model groups for automatic selection.
 */
export const MODEL_GROUPS: readonly ModelGroup[] = [
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
    models: BUILTIN_MODELS.filter((m) => m.contextWindow > 500_000).map(
      (m) => m.id,
    ),
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
]

/**
 * Select the best model group for given capabilities.
 */
export function selectModelGroup(
  requiredCapabilities: readonly string[],
): ModelGroup {
  for (const group of MODEL_GROUPS) {
    const hasAllCapabilities = requiredCapabilities.every((cap) =>
      group.capabilities.includes(cap),
    )
    if (hasAllCapabilities) {
      return group
    }
  }
  return MODEL_GROUPS[MODEL_GROUPS.length - 1]
}

/**
 * Get available models within a group, filtered by status.
 */
export function getAvailableModelsInGroup(
  group: ModelGroup,
): readonly string[] {
  return group.models.filter((modelId) => {
    const model = BUILTIN_MODELS.find((m) => m.id === modelId)
    if (!model) return true // Unknown models pass through
    return model.status === ModelStatus.Available
  })
}
