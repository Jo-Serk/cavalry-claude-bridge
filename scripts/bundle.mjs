// Bundles the whole server (SDK included) into ONE file, so the .mcpb needs no node_modules.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "server/index.js",
  loader: { ".md": "text" },
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
  legalComments: "none",
});
console.log("bundled -> server/index.js");
