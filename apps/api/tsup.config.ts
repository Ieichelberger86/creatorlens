import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  minify: false,
  sourcemap: true,
  splitting: false,
  // Bundle workspace packages in (they point at .ts source); leave runtime deps external.
  noExternal: [/^@creatorlens\//],
  dts: false,
});
