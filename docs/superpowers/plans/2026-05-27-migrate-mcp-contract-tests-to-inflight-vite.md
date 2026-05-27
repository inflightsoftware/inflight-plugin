# Migrate MCP Contract Tests to `inflight-vite/apps/mcp` — Plan

**Date:** 2026-05-27
**Status:** Ready to execute (work happens in `inflight-vite`, not this repo)
**Reference for the work:** this file + the existing-but-frozen tests at `tests/ci/mcp-contract/` in `inflight-plugin`.

## Why this lives at all

PR 1 in `inflight-plugin` ships an MCP contract test that's local/manual only because the Inflight MCP server uses OAuth (no PAT), and there's no automatable token path from CI. Moving the tests next to the server solves three problems at once:

- **Auth is trivial there.** `apps/mcp/src/lib/supabase.ts` already exports `supabaseAdmin`. Tests can insert a fixture user + session token directly into `mcp_sessions` — no OAuth, no token capture.
- **Faster feedback.** Contract drift gets caught in the same PR that introduces it (in `inflight-vite`), not nightly weeks later in the plugin repo.
- **The server owns the contract.** Tool responses originate there; tests should fail in the same repo as the code under test.

## What changed in our understanding during preparation

I read every tool in `apps/mcp/src/tools/*.ts` and found that **every JSON Schema we wrote in `inflight-plugin/tests/ci/mcp-contract/schemas/` is wrong**. The schemas assumed flat shapes (bare arrays, `{success: true}`); the real tools wrap data in objects with named fields. `inflight_get_version_report` returns Markdown, not structured JSON at all. The migration must rewrite all 7 schemas based on actual tool behaviour (corrected shapes are listed below).

## Where the tests should live

```text
inflight-vite/
└── apps/mcp/
    ├── src/
    │   └── __tests__/
    │       ├── contract.test.ts          ← new
    │       ├── fixtures.ts                ← new (mint user + session token + workspace + project)
    │       └── schemas/                   ← new (corrected JSON Schemas, 7 files)
    └── package.json                       ← add `test` script + `ajv` devDep (only if validating with JSON Schema; otherwise use zod which is already there)
```

## Auth strategy in `apps/mcp` tests

No OAuth. Each test run:

1. Creates a fixture user in `auth.users` via supabaseAdmin (or reuses one with a known UUID — preferred for cleanup safety)
2. Creates a fixture workspace + membership for that user
3. Inserts a row into `mcp_sessions` with a generated `iflt_live_test_<random>` token
4. Boots the Hono app (or imports tools directly — see two options below)
5. Tests run against the local HTTP server with that token
6. afterAll: delete fixture rows so the next run is clean

## Two test approaches — pick one

### Option A (recommended): HTTP integration via Hono app

- Import the Hono `app` from `src/index.ts`
- Hit it with `app.request()` (Hono's built-in test helper) — no real network, no port binding
- Send real MCP JSON-RPC envelopes
- Validates the entire wire path: auth middleware → session → MCP transport → tool handler → envelope → text/JSON response

Pros: tests what the plugin actually sees over the wire.
Cons: needs the session_token fixture, slightly more setup.

### Option B: direct tool invocation

- Import each tool's registration function and call its handler directly with a userId
- Skip Hono entirely; skip MCP transport; skip auth middleware
- Validate response objects against schemas

Pros: simpler, no session_token needed (just a userId), faster.
Cons: doesn't test auth, session lookup, JSON-RPC envelope. Misses bugs in those layers.

**Recommendation:** Option A. The whole point of contract tests is "what consumers see over the wire."

## Corrected response shapes (use these for new schemas)

These come from reading `apps/mcp/src/tools/*.ts` directly. Every response is wrapped in `{ content: [{ type: "text", text: "<...>" }] }` by the `ok()` helper at `apps/mcp/src/lib/mcp-helpers.ts`; the inner `text` is `JSON.stringify(data, null, 2)` for everything except `get_version_report` which returns Markdown directly.

### `inflight_get_workspaces`

```json
{
  "workspaces": [
    { "id": "uuid", "name": "string", "widget_id": "string", "is_default": "boolean" }
  ],
  "default_workspace_id": "uuid | null"
}
```

### `inflight_set_default_workspace`

```json
{
  "workspace_id": "uuid",
  "workspace_name": "string | null",
  "message": "string"
}
```

### `inflight_list_recent_projects`

```json
{
  "workspace_id": "uuid",
  "projects": "array"
}
```

May also return `workspace_selection_required` error variant: `{ error: "workspace_selection_required", message, workspaces }`.

### `inflight_list_versions`

```json
{
  "workspace_id": "uuid",
  "versions": "array"
}
```

Same `workspace_selection_required` variant possible.

### `inflight_create_version`

Two variants depending on whether `override_version_id` is passed:

**Standard create:**

```json
{
  "version_id": "uuid",
  "project_id": "uuid",
  "public_id": "string (8-char short id)",
  "staging_url": "string (with ?inflight_auth=<grant>)",
  "feedback_guide_count": "number",
  "message": "string"
}
```

**Override variant:**

```json
{
  "version_id": "uuid",
  "project_id": "uuid",
  "version_public_id": "string",
  "staging_url": "string",
  "message": "string"
}
```

Note the field name difference (`public_id` vs `version_public_id`) — worth flagging to the server team during migration; consider unifying.

### `inflight_get_version_report`

**Returns Markdown text, not structured JSON.** The content shape is:

```text
{
  "content": [
    { "type": "text", "text": "<markdown report with header + feedback + next_steps sections separated by ---\n>" }
  ]
}
```

Contract test should validate:
- `content[0].text` is a non-empty string
- Contains the three section separators (or equivalent structural markers)
- (Optional) Contains expected substrings for a seeded version with known feedback

### `inflight_complete_next_step`

```json
{
  "next_step_id": "uuid",
  "title": "string",
  "message": "string"
}
```

## Draft test file (drop into `apps/mcp/src/__tests__/contract.test.ts`)

This is a starting point — wire details (Hono request shape, MCP JSON-RPC envelope) need verification when actually run. Uses `bun:test` (built-in).

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import app from "../index";
import { supabaseAdmin } from "../lib/supabase";

const TEST_USER_ID = process.env.MCP_CONTRACT_TEST_USER_ID;
const TEST_SESSION_TOKEN = `iflt_live_test_${crypto.randomUUID().replace(/-/g, "")}`;

// Skip the whole suite if the fixture user isn't configured.
// Document in apps/mcp/README.md how to set this up locally + in CI.
const describeIf = TEST_USER_ID ? describe : describe.skip;

describeIf("MCP contract — all 7 tools", () => {
  beforeAll(async () => {
    // Insert a session token for the fixture user
    const { error } = await supabaseAdmin.from("mcp_sessions").insert({
      user_id: TEST_USER_ID,
      session_token: TEST_SESSION_TOKEN,
      client_name: "contract-test",
    });
    if (error) throw new Error(`Failed to seed session: ${error.message}`);
  });

  afterAll(async () => {
    await supabaseAdmin.from("mcp_sessions").delete().eq("session_token", TEST_SESSION_TOKEN);
  });

  async function callTool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const res = await app.request("/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
        Accept: "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const payload = await res.json();
    if (payload.error) throw new Error(`MCP error: ${payload.error.message}`);
    const text = payload.result?.content?.[0]?.text;
    // get_version_report returns Markdown — caller decides whether to parse JSON
    return text as T;
  }

  test("inflight_get_workspaces returns workspaces array + default_workspace_id", async () => {
    const text = await callTool<string>("inflight_get_workspaces");
    const data = JSON.parse(text);
    expect(Array.isArray(data.workspaces)).toBe(true);
    expect(data.workspaces[0]).toHaveProperty("id");
    expect(data.workspaces[0]).toHaveProperty("widget_id");
    expect(data.workspaces[0]).toHaveProperty("is_default");
    expect(data).toHaveProperty("default_workspace_id");
  });

  // ... one test per remaining tool, following the corrected shapes above
});
```

## Schemas — keep or drop?

I'd **drop the JSON Schema approach** in favor of direct field assertions like the example above, OR use `zod` (already a dep) for runtime validation. JSON Schema adds an `ajv` dep that buys little when bun:test's `expect` already gives good error messages.

If you want to keep the consumer-side contract artifact in `inflight-plugin`, keep the schemas dir but rename it to `tests/contract-schemas/` and update them to match the real shapes above. The server tests can then import them as documented expectations.

## What to do in `inflight-plugin` once the migration ships

1. Delete `tests/ci/mcp-contract/` entirely
2. Delete `tests/src/mcp-client.ts`
3. Update `tests/README.md` to remove the "MCP contract tests (local / manual)" section
4. Update the testing-strategy spec at `docs/superpowers/specs/2026-05-25-plugin-testing-strategy-design.md` to point readers to `inflight-vite/apps/mcp/src/__tests__/contract.test.ts` for the canonical contract suite

(Leave everything in place until the migration lands — this plan is the holding ground.)

## Open questions for the migrating engineer

1. **Where does the fixture user come from?** Options:
   - Hardcode a UUID + seed via a one-time SQL migration in `supabase/migrations/`
   - Create the user in `beforeAll` (more isolation, more code)
2. **Test workspace data:** seeded version + next step IDs need to exist for `get_version_report` and `complete_next_step` to do anything meaningful. Either seed via SQL migration, or have `beforeAll` create them and `afterAll` clean up.
3. **CI:** which workflow runs these? `apps/mcp` doesn't have CI today. Likely a new `.github/workflows/mcp-tests.yml` in `inflight-vite` triggered on changes to `apps/mcp/**`.
4. **Schema-sharing strategy** if we keep the schemas in `inflight-plugin`: copy / submodule / npm publish? Probably copy + a one-liner comment until churn justifies more.
