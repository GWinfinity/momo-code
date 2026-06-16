/**
 * Provider module barrel export.
 */

export {
  Provider,
  ProviderLive,
  BUILTIN_TIERS,
  BUILTIN_MODELS,
  PROVIDER_FACTORIES,
  DEFAULT_CHUNK_TIMEOUT,
  OPENAI_HEADER_TIMEOUT_DEFAULT,
  wrapSSE,
  resolveTierModel,
  resolveModel,
  expandModelId,
  listProviderNames,
  listAvailableProviders,
  resolveClaudeCodeInheritance,
  loadClaudeCodeSettings,
  findClaudePromptsDir,
} from "./provider"

export type {
  ProviderFactory,
  ProviderFactoryResult,
  ModelGroupEntry,
  UnifiedLanguageModel,
  ClaudeCodeInheritanceConfig,
  TierName,
} from "./provider"

export { ModelStatus } from "./model-status"
export { fetchModelCatalog, getModelsUrl } from "./models"
export type { ModelCatalog, ModelCatalogEntry } from "./models"
export { ProviderTransform } from "./transform"
export {
  ProviderError,
  ChunkTimeoutError,
  ModelResolutionError,
  ProviderInitializationError,
  ResponseStreamError,
  ProviderAuthError,
  ModelCatalogError,
} from "./error"
