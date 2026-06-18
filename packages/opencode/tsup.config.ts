import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "cli/index": "src/cli/index.ts",
    "experience/index": "src/experience/index.ts",
  },
  outDir: "dist",
  format: ["esm"],
  target: "node20",
  platform: "node",
  bundle: true,
  splitting: true,
  sourcemap: true,
  dts: true,
  clean: true,
  // Handle path aliases from tsconfig.json
  tsconfig: "./tsconfig.json",
  // External deps that shouldn't be bundled
  external: [
    "effect",
    "ai",
    "@ai-sdk/provider",
    "fuzzysort",
    "remeda",
  ],
  // Replace #db import with runtime resolution
  esbuildOptions(options) {
    options.alias = {
      ...options.alias,
      "#db": "./src/storage/db.node.ts",
    }
  },
})
