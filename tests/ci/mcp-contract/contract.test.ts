// tests/ci/mcp-contract/contract.test.ts
import { describe, expect, it, beforeAll } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { McpClient } from "../../src/mcp-client.ts";
import { REPO_ROOT } from "../../src/repo-paths.ts";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

function loadSchema(name: string): object {
  return JSON.parse(
    readFileSync(
      resolve(REPO_ROOT, `tests/ci/mcp-contract/schemas/${name}.json`),
      "utf8",
    ),
  );
}

function assertMatches(schemaName: string, data: unknown) {
  const validate = ajv.compile(loadSchema(schemaName));
  const ok = validate(data);
  if (!ok) {
    throw new Error(
      `MCP response for ${schemaName} does not match schema:\n` +
        JSON.stringify(validate.errors, null, 2) +
        `\nResponse:\n` +
        JSON.stringify(data, null, 2),
    );
  }
}

const client = McpClient.fromEnv();
const describeIf = client ? describe : describe.skip;

describeIf("MCP contract — all 7 tools", () => {
  let workspaceId: string;

  beforeAll(async () => {
    // Sanity: pick the CI workspace's id for later state-changing calls
    const workspaces = await client!.callTool<
      Array<{ id: string; widget_id: string; name: string }>
    >("inflight_get_workspaces");
    if (workspaces.length === 0) throw new Error("CI token has no workspaces");
    workspaceId = workspaces[0]!.id;
  });

  it("inflight_get_workspaces", async () => {
    const data = await client!.callTool("inflight_get_workspaces");
    assertMatches("get_workspaces", data);
  });

  it("inflight_set_default_workspace", async () => {
    const data = await client!.callTool("inflight_set_default_workspace", {
      workspace_id: workspaceId,
    });
    assertMatches("set_default_workspace", data);
  });

  it("inflight_list_recent_projects", async () => {
    const data = await client!.callTool("inflight_list_recent_projects");
    assertMatches("list_recent_projects", data);
  });

  it("inflight_list_versions", async () => {
    const data = await client!.callTool("inflight_list_versions");
    assertMatches("list_versions", data);
  });

  it("inflight_get_version_report — against a seeded version", async () => {
    // The CI workspace MUST contain a seeded version with this public_id.
    // Setup instructions live in tests/README.md.
    const publicId = process.env.INFLIGHT_CI_SEEDED_VERSION_PUBLIC_ID;
    if (!publicId) {
      throw new Error(
        "INFLIGHT_CI_SEEDED_VERSION_PUBLIC_ID env var not set — see tests/README.md",
      );
    }
    const data = await client!.callTool("inflight_get_version_report", {
      public_id: publicId,
    });
    assertMatches("get_version_report", data);
  });

  it("inflight_create_version — dry-run-ish (creates against CI project)", async () => {
    const projectId = process.env.INFLIGHT_CI_PROJECT_ID;
    if (!projectId) {
      throw new Error(
        "INFLIGHT_CI_PROJECT_ID env var not set — see tests/README.md",
      );
    }
    const data = await client!.callTool("inflight_create_version", {
      project_id: projectId,
      title: `ci-contract-test-${Date.now()}`,
      // Deliberately leave URL blank if API allows it; otherwise pass a fixture URL.
      url: "https://example.com",
    });
    assertMatches("create_version", data);
  });

  it("inflight_complete_next_step", async () => {
    const nextStepId = process.env.INFLIGHT_CI_NEXT_STEP_ID;
    if (!nextStepId) {
      throw new Error(
        "INFLIGHT_CI_NEXT_STEP_ID env var not set — see tests/README.md (this should be a never-actually-completed seeded step the server treats as idempotent)",
      );
    }
    const data = await client!.callTool("inflight_complete_next_step", {
      next_step_id: nextStepId,
    });
    assertMatches("complete_next_step", data);
  });
});
