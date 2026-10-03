import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const [manifest, pkg, versions] = await Promise.all([
  json("manifest.json"),
  json("package.json"),
  json("versions.json"),
]);
assert.equal(pkg.version, manifest.version);
assert.equal(versions[manifest.version], manifest.minAppVersion);
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(manifest.id, "zettel-agent");
assert.equal(manifest.isDesktopOnly, true);
for (const file of ["main.js", "manifest.json", "styles.css"])
  assert.ok((await stat(file)).size > 0, `${file} is empty`);
const bundle = await readFile("main.js", "utf8");
assert.ok(!bundle.includes("sourceMappingURL"), "Release bundle must omit source maps");
assert.ok(
  !/\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/.test(bundle),
  "Possible embedded credential in bundle",
);
console.log(
  `Verified ${manifest.id} ${manifest.version}: three assets, matching versions, production bundle.`,
);
