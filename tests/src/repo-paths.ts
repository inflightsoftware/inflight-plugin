import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..", "..");

export const MANIFESTS = {
  claudeCode: resolve(REPO_ROOT, ".claude-plugin/plugin.json"),
  codex: resolve(REPO_ROOT, ".codex-plugin/plugin.json"),
  cursor: resolve(REPO_ROOT, ".cursor-plugin/plugin.json"),
  mcp: resolve(REPO_ROOT, ".mcp.json"),
  codexConfig: resolve(REPO_ROOT, ".codex/config.toml"),
} as const;

export const SKILLS_DIR = resolve(REPO_ROOT, "skills");
