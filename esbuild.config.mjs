import { copyFile, mkdir } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";

import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

// Set OBSIDIAN_PLUGIN_DIR to <test vault>/.obsidian/plugins/agentic-zettelkasten
// to copy each build into a vault for manual testing.
const pluginDir = process.env.OBSIDIAN_PLUGIN_DIR;
const releaseAssets = ["main.js", "manifest.json", "styles.css"];

/** @type {esbuild.Plugin} */
const copyToVault = {
  name: "copy-to-vault",
  setup(build) {
    build.onEnd(async (result) => {
      if (!pluginDir || result.errors.length > 0) return;
      await mkdir(pluginDir, { recursive: true });
      await Promise.all(releaseAssets.map((file) => copyFile(file, path.join(pluginDir, file))));
      console.log(`[copy-to-vault] ${releaseAssets.join(", ")} -> ${pluginDir}`);
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/*",
    "@lezer/*",
    ...builtinModules,
    ...builtinModules.map((moduleName) => `node:${moduleName}`),
  ],
  format: "cjs",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development") },
  minify: production,
  sourcemap: production ? false : "inline",
  treeShaking: true,
  logLevel: "info",
  plugins: [copyToVault],
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
