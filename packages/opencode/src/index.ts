/**
 * momo Code - Main package entry point.
 *
 * Exports the core provider system, configuration, and utilities
 * for the momo Code AI coding agent.
 */

// Provider system
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
} from "./provider/provider"

// Types
export type {
  ProviderFactory,
  ProviderFactoryResult,
  ModelGroupEntry,
  UnifiedLanguageModel,
  ClaudeCodeInheritanceConfig,
  TierName,
} from "./provider/provider"

// Model status
export { ModelStatus } from "./provider/model-status"

// Errors
export {
  ProviderError,
  ChunkTimeoutError,
  ModelResolutionError,
  ProviderInitializationError,
  ResponseStreamError,
  ProviderAuthError,
  ModelCatalogError,
} from "./provider/error"

// Transform
export { ProviderTransform } from "./provider/transform"

// Models
export { fetchModelCatalog, getModelsUrl } from "./provider/models"
export type { ModelCatalog, ModelCatalogEntry } from "./provider/models"

// Configuration
export {
  Config,
  ConfigLive,
  loadUserConfig,
  getConfigDir,
  getConfigFilePath,
  getSessionsDir,
  getClaudeCodeDir,
  CONFIG_DIR_NAME,
  CONFIG_FILE_NAME,
} from "./config/config"
export type { UserConfig } from "./config/config"

// Environment
export { Env, EnvLive, ENV_NAMES, ENV_PREFIX } from "./env"

// Authentication
export { Auth, AuthLive } from "./auth"
export type { ProviderCredentials } from "./auth"

// Instance state
export {
  InstanceState,
  defaultInstanceState,
} from "./effect/instance-state"
export type { InstanceStateShape } from "./effect/instance-state"

// Prompt routing
export {
  loadSystemPrompt,
  loadMomoSystemPrompt,
  resolvePromptFile,
  getPromptSearchPaths,
  findPromptFile,
  getMinimalSystemPrompt,
  getMomoDefaultPrompt,
  isClaudeCodeInheritanceEnabled,
  listAvailablePrompts,
  MOMO_PROMPT_FILE,
  DEFAULT_PROMPT_FILE,
  ANTHROPIC_PROMPT_FILE,
  GPT_PROMPT_FILE,
  GOOGLE_PROMPT_FILE,
  PROMPT_RULES,
} from "./session/prompt"

// Experience fast loop (KEP)
export {
  Evolve,
  InjectForTask,
  SolidifyHook,
  CollectorLive,
  DistillerLive,
  SelectorLive,
  InjectorLive,
  SolidifyLive,
  GateLive,
  BridgeLive,
  ExperienceStoreLive,
  ExperienceGuardLive,
  winRate,
  thompsonSample,
  ucbScore,
  canActivate,
  canPromote,
  shouldRetire,
  generateTacticId,
  createCase,
  matchSignalPattern,
} from "./experience/index.js"
export type {
  EvolveOpts,
  TaskCtx,
  Tactic,
  TacticScope,
  TacticStats,
  TacticStatus,
  TacticGuardrails,
  TacticProvenance,
  Case,
  CaseVerdict,
  SignalPattern,
  SelectionOpts,
  TaskContext,
  RankedTactic,
  InjectResult,
  InjectOpts,
  DistillResult,
  ApplyVerdictOpts,
} from "./experience/index.js"
