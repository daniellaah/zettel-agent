import { execFileSync } from "node:child_process";
import path from "node:path";

import { DEBUG_PORT, ObsidianPage } from "./cdp";

/** macOS helpers to run Obsidian on the fixture vault with a local debugging port. */

export const FIXTURE_VAULT = path.resolve(import.meta.dirname, "../fixtures/vault");
export const PLUGIN_DIR = path.join(FIXTURE_VAULT, ".obsidian/plugins/zettel-agent");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function debugPortOpen(): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, {
      signal: AbortSignal.timeout(1000),
    });
    return true;
  } catch {
    return false;
  }
}

function obsidianRunning(): boolean {
  try {
    execFileSync("pgrep", ["-x", "Obsidian"]);
    return true;
  } catch {
    return false;
  }
}

async function quitObsidian(): Promise<void> {
  if (!obsidianRunning()) return;
  execFileSync("osascript", ["-e", 'tell application "Obsidian" to quit']);
  for (let i = 0; i < 40 && obsidianRunning(); i++) await sleep(250);
  if (obsidianRunning()) throw new Error("Obsidian did not quit.");
}

/** Restarts Obsidian with the debugging port, on the fixture vault. */
export async function launchWithDebugPort(): Promise<void> {
  await quitObsidian();
  execFileSync("open", ["-a", "Obsidian", "--args", `--remote-debugging-port=${DEBUG_PORT}`]);
  for (let i = 0; i < 60 && !(await debugPortOpen()); i++) await sleep(500);
  if (!(await debugPortOpen())) throw new Error("Obsidian did not open the debugging port.");
  execFileSync("open", [`obsidian://open?path=${encodeURIComponent(FIXTURE_VAULT)}`]);
}

/** Restarts Obsidian normally, closing the debugging port. */
export async function relaunchNormally(): Promise<void> {
  await quitObsidian();
  execFileSync("open", ["-a", "Obsidian"]);
}

/**
 * Connects to the window showing the fixture vault. Other windows are only asked for
 * their vault path, so tests can never touch the owner's real notes.
 */
export async function connectToFixtureVault(): Promise<ObsidianPage> {
  for (let attempt = 0; attempt < 40; attempt++) {
    for (const url of await ObsidianPage.windows().catch(() => [])) {
      const page = await ObsidianPage.connect(url).catch(() => null);
      if (!page) continue;
      const basePath = await page
        .evaluate<string | null>("return app?.vault?.adapter?.basePath ?? null;")
        .catch(() => null);
      if (basePath && path.resolve(basePath) === FIXTURE_VAULT) return page;
      page.close();
    }
    await sleep(500);
  }
  throw new Error(`No Obsidian window has the fixture vault (${FIXTURE_VAULT}) open.`);
}
