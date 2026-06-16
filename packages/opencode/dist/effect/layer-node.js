/**
 * Layer composition utilities for Effect.
 * Provides helpers for building and composing Effect layers.
 */
import { Layer } from "effect";
/**
 * Create a named layer node for dependency tracking.
 */
export function layerNode(name, layer, dependencies) {
    return { name, layer, dependencies };
}
/**
 * Flatten a dependency tree into a composed layer.
 */
export function flattenLayers(root) {
    if (!root.dependencies || root.dependencies.length === 0) {
        return root.layer;
    }
    const depLayers = root.dependencies.map((dep) => flattenLayers(dep));
    return Layer.provide(root.layer, Layer.mergeAll(...depLayers));
}
/**
 * Build a merged layer from multiple independent nodes.
 */
export function mergeLayers(nodes) {
    return Layer.mergeAll(...nodes.map((n) => n.layer));
}
//# sourceMappingURL=layer-node.js.map