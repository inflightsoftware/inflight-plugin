import { readFileSync } from "node:fs";
import { parse as parseToml } from "@iarna/toml";
import { MANIFESTS } from "./repo-paths.ts";

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  repository: string;
  [key: string]: unknown;
}

export interface McpConfig {
  mcpServers: Record<string, { type: string; url: string }>;
}

export function loadJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadToml(path: string): unknown {
  return parseToml(readFileSync(path, "utf8"));
}

export function loadAllPluginManifests(): {
  claudeCode: PluginManifest;
  codex: PluginManifest;
  cursor: PluginManifest;
} {
  return {
    claudeCode: loadJson<PluginManifest>(MANIFESTS.claudeCode),
    codex: loadJson<PluginManifest>(MANIFESTS.codex),
    cursor: loadJson<PluginManifest>(MANIFESTS.cursor),
  };
}

export function loadMcpConfig(): McpConfig {
  return loadJson<McpConfig>(MANIFESTS.mcp);
}
