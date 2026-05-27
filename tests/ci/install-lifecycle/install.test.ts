import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execa } from "execa";
import { homedir } from "node:os";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "../../src/repo-paths.ts";

const PLUGIN_NAME = "inflight";
const PLUGINS_DIR = resolve(homedir(), ".claude/plugins");

// Only run in CI. Installing into a developer's plugin directory is invasive.
const CI = !!process.env.CI;

function findInflightPluginDir(): string | null {
  if (!existsSync(PLUGINS_DIR)) return null;
  const entries = readdirSync(PLUGINS_DIR);
  // The `plugins` CLI may name the directory by plugin name, repo name, or
  // a hash. Look for any entry whose name contains "inflight".
  const match = entries.find((e) => e.toLowerCase().includes(PLUGIN_NAME));
  if (!match) return null;
  const path = resolve(PLUGINS_DIR, match);
  if (!statSync(path).isDirectory()) return null;
  return path;
}

const describeIf = CI ? describe : describe.skip;

describeIf("plugin install lifecycle (Claude Code)", () => {
  beforeAll(() => {
    // Defensive cleanup in case a prior run left state behind.
    const existing = findInflightPluginDir();
    if (existing) rmSync(existing, { recursive: true, force: true });
  });

  afterAll(() => {
    const existing = findInflightPluginDir();
    if (existing) rmSync(existing, { recursive: true, force: true });
  });

  it("install from local checkout succeeds", async () => {
    const result = await execa(
      "npx",
      [
        "--yes",
        "plugins",
        "add",
        REPO_ROOT,
        "--target",
        "claude-code",
        "--scope",
        "user",
        "--yes",
      ],
      { reject: false, timeout: 120_000 },
    );
    expect(result.exitCode, `stderr: ${result.stderr}\nstdout: ${result.stdout}`).toBe(0);
  });

  it("install created a plugin directory under ~/.claude/plugins/", () => {
    const dir = findInflightPluginDir();
    expect(dir, `no inflight plugin directory found in ${PLUGINS_DIR}`).not.toBeNull();
  });

  it("uninstall (manual rm) removes the plugin directory", () => {
    const dir = findInflightPluginDir();
    expect(dir).not.toBeNull();
    rmSync(dir!, { recursive: true, force: true });
    expect(findInflightPluginDir()).toBeNull();
  });
});
