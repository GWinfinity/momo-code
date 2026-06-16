/**
 * CLI models command for momo Code.
 * Provides listing, search, and selection of available models.
 */
import { Effect } from "effect";
import { Auth } from "../../auth";
/**
 * List all available models grouped by tier.
 */
export declare function listModels(): Effect.Effect<void>;
/**
 * Show detailed info for a specific model.
 */
export declare function showModelInfo(modelId: string): Effect.Effect<void, never, Auth>;
/**
 * Show available providers.
 */
export declare function showProviders(): Effect.Effect<void>;
/**
 * CLI argument parsing for the models command.
 */
export declare function parseModelsArgs(args: string[]): {
    command: string;
    modelId?: string;
};
/**
 * Execute the models CLI command.
 */
export declare function runModelsCommand(args: string[]): Effect.Effect<void, never, Auth>;
//# sourceMappingURL=models.d.ts.map