import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadAllPluginManifests,
  loadMcpConfig,
  loadToml,
  loadJson,
} from "../../src/load-manifests.ts";
import { MANIFESTS, REPO_ROOT } from "../../src/repo-paths.ts";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const pluginManifestSchema = {
  type: "object",
  required: ["name", "version", "description", "repository"],
  properties: {
    name: { type: "string", const: "inflight" },
    version: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    description: { type: "string", minLength: 10 },
    repository: { type: "string", format: "uri" },
    license: { type: "string" },
  },
  additionalProperties: true,
} as const;

const validatePluginManifest = ajv.compile(pluginManifestSchema);

const mcpConfigSchema = {
  type: "object",
  required: ["mcpServers"],
  properties: {
    mcpServers: {
      type: "object",
      required: ["inflight"],
      properties: {
        inflight: {
          type: "object",
          required: ["url"],
          properties: {
            type: { type: "string" },
            url: { type: "string", format: "uri" },
          },
        },
      },
    },
  },
} as const;

const validateMcpConfig = ajv.compile(mcpConfigSchema);

describe("plugin manifests", () => {
  const manifests = loadAllPluginManifests();

  for (const [host, manifest] of Object.entries(manifests)) {
    it(`${host} manifest matches schema`, () => {
      const ok = validatePluginManifest(manifest);
      if (!ok) {
        throw new Error(
          `${host} manifest invalid: ${JSON.stringify(validatePluginManifest.errors, null, 2)}`,
        );
      }
    });
  }

  it("all three manifests share the same version", () => {
    const versions = new Set(Object.values(manifests).map((m) => m.version));
    expect([...versions]).toHaveLength(1);
  });

  it("all three manifests share the same repository URL", () => {
    const repos = new Set(Object.values(manifests).map((m) => m.repository));
    expect([...repos]).toHaveLength(1);
  });

  it("validator catches a deliberately broken fixture", () => {
    const bad = loadJson(
      resolve(REPO_ROOT, "tests/fixtures/bad-manifest-missing-version.json"),
    );
    expect(validatePluginManifest(bad)).toBe(false);
  });
});

describe(".mcp.json", () => {
  it("matches schema", () => {
    const config = loadMcpConfig();
    const ok = validateMcpConfig(config);
    if (!ok) {
      throw new Error(
        `.mcp.json invalid: ${JSON.stringify(validateMcpConfig.errors, null, 2)}`,
      );
    }
  });

  it("inflight server URL points to https://mcp.inflight.co", () => {
    const config = loadMcpConfig();
    expect(config.mcpServers.inflight.url).toBe("https://mcp.inflight.co");
  });
});

describe(".codex/config.toml", () => {
  it("parses as TOML and declares the inflight MCP server", () => {
    const cfg = loadToml(MANIFESTS.codexConfig) as {
      mcp_servers?: { inflight?: { url?: string } };
    };
    expect(cfg.mcp_servers?.inflight?.url).toBe("https://mcp.inflight.co");
  });
});
