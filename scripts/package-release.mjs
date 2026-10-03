import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const env = { ...process.env };
delete env.OBSIDIAN_PLUGIN_DIR;
execFileSync(process.execPath, ["esbuild.config.mjs", "--production"], { env, stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-release.mjs"], { stdio: "inherit" });
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = path.resolve("artifacts/releases", `${manifest.version}-local-${stamp}`);
const plugin = path.join(destination, manifest.id);
await mkdir(plugin, { recursive: true });
const checksums = {};
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  await copyFile(file, path.join(plugin, file));
  checksums[file] = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}
const zipName = `zettel-agent-${manifest.version}-local.zip`;
execFileSync(
  "zip",
  ["-X", "-q", zipName, ...Object.keys(checksums).map((f) => `${manifest.id}/${f}`)],
  { cwd: destination },
);
checksums[zipName] = createHash("sha256")
  .update(await readFile(path.join(destination, zipName)))
  .digest("hex");
const sourceFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const sourceHashes = {};
for (const file of sourceFiles)
  sourceHashes[file] = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
const state = {
  status: "uncommitted local snapshot; not tagged or published",
  version: manifest.version,
  createdAt: new Date().toISOString(),
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  node: process.version,
  sourceStatus: execFileSync("git", ["status", "--short"], { encoding: "utf8" }),
  sourceHashes,
  checksums,
};
await writeFile(path.join(destination, "SOURCE_STATE.json"), `${JSON.stringify(state, null, 2)}\n`);
await writeFile(
  path.join(destination, "SHA256SUMS"),
  Object.entries(checksums)
    .map(([file, hash]) => `${hash}  ${file}`)
    .join("\n") + "\n",
);
console.log(`Local installable snapshot: ${destination}`);
