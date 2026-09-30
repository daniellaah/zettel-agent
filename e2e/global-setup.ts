import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  FIXTURE_VAULT,
  PLUGIN_DIR,
  connectToFixtureVault,
  debugPortOpen,
  launchWithDebugPort,
  relaunchNormally,
} from "./obsidian";

const REPO = path.resolve(import.meta.dirname, "..");

/**
 * Builds the plugin into the fixture vault, starts Obsidian with a debugging port if it
 * is not already running with one, and reloads the plugin. Afterwards, Obsidian is
 * restarted normally unless E2E_KEEP_OBSIDIAN=1 or it already had the port open.
 */
export default async function setup(): Promise<() => Promise<void>> {
  execFileSync("node", ["esbuild.config.mjs", "--production"], {
    cwd: REPO,
    env: { ...process.env, OBSIDIAN_PLUGIN_DIR: PLUGIN_DIR },
    stdio: "ignore",
  });
  enableInFixtureVault();

  const launched = !(await debugPortOpen());
  if (launched) {
    console.log("e2e: restarting Obsidian with a local debugging port on the fixture vault");
    await launchWithDebugPort();
  }
  const restore = async () => {
    if (launched && process.env.E2E_KEEP_OBSIDIAN !== "1") {
      console.log("e2e: restarting Obsidian normally");
      await relaunchNormally();
    }
  };
  try {
    const page = await connectToFixtureVault();
    await page.run("reload");
    page.close();
  } catch (error) {
    await restore(); // never leave the debugging port open after a failed setup
    throw error;
  }
  return restore;
}

/** The fixture vault's .obsidian folder is git-ignored; make sure the plugin is enabled. */
function enableInFixtureVault(): void {
  const file = path.join(FIXTURE_VAULT, ".obsidian/community-plugins.json");
  mkdirSync(path.dirname(file), { recursive: true });
  const enabled = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as string[]) : [];
  if (!enabled.includes("zettel-agent")) {
    writeFileSync(file, `${JSON.stringify([...enabled, "zettel-agent"])}\n`);
  }
}
