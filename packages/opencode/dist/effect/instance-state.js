/**
 * Instance state management for momo Code.
 * Tracks per-instance mutable state including the current model selection,
 * allowing hot-swapping of models during a session.
 */
import { Effect, Ref } from "effect";
/** Default initial state for a fresh instance. */
export const defaultInstanceState = {
    currentModel: null,
    resolvedModelId: null,
    currentProvider: null,
    isTierSelection: false,
    lastModelSwapAt: null,
    claudeCodeInheritance: {
        enabled: true,
        configPath: null,
        settingsInherited: false,
        promptsInherited: false,
    },
};
/**
 * InstanceState service provides a mutable reference for per-instance data.
 * Each coding agent instance gets its own state container.
 */
export class InstanceState extends Effect.Service()("InstanceState", {
    effect: Effect.gen(function* () {
        const stateRef = yield* Ref.make(defaultInstanceState);
        /** Get a snapshot of the current state. */
        const get = Effect.gen(function* () {
            return yield* Ref.get(stateRef);
        });
        /** Update the state with a partial patch. */
        const update = (patch) => Ref.update(stateRef, (current) => ({
            ...current,
            ...patch,
            claudeCodeInheritance: {
                ...current.claudeCodeInheritance,
                ...(patch.claudeCodeInheritance || {}),
            },
        }));
        /** Set the current model and provider. */
        const setModel = (model, modelId, provider, isTier = false) => update({
            currentModel: model,
            resolvedModelId: modelId,
            currentProvider: provider,
            isTierSelection: isTier,
            lastModelSwapAt: Date.now(),
        });
        /** Set Claude Code inheritance state. */
        const setClaudeCodeInheritance = (enabled, configPath, settingsInherited, promptsInherited) => update({
            claudeCodeInheritance: {
                enabled,
                configPath,
                settingsInherited,
                promptsInherited,
            },
        });
        /** Reset state to defaults. */
        const reset = Ref.set(stateRef, defaultInstanceState);
        return { get, update, setModel, setClaudeCodeInheritance, reset };
    }),
}) {
}
//# sourceMappingURL=instance-state.js.map