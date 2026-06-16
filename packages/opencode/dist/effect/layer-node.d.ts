/**
 * Layer composition utilities for Effect.
 * Provides helpers for building and composing Effect layers.
 */
import { Layer } from "effect";
/**
 * A LayerNode represents a named layer in the application dependency graph.
 */
export interface LayerNode<RIn, E, ROut> {
    readonly name: string;
    readonly layer: Layer.Layer<RIn, E, ROut>;
    readonly dependencies?: ReadonlyArray<LayerNode<unknown, unknown, unknown>>;
}
/**
 * Create a named layer node for dependency tracking.
 */
export declare function layerNode<RIn, E, ROut>(name: string, layer: Layer.Layer<RIn, E, ROut>, dependencies?: ReadonlyArray<LayerNode<unknown, unknown, unknown>>): LayerNode<RIn, E, ROut>;
/**
 * Flatten a dependency tree into a composed layer.
 */
export declare function flattenLayers<RIn, E, ROut>(root: LayerNode<RIn, E, ROut>): Layer.Layer<RIn, E, ROut>;
/**
 * Build a merged layer from multiple independent nodes.
 */
export declare function mergeLayers<RIn extends unknown, E, ROut extends unknown>(nodes: ReadonlyArray<LayerNode<RIn, E, ROut>>): Layer.Layer<RIn, E, ROut>;
//# sourceMappingURL=layer-node.d.ts.map