# Plugin Tests

Three tiers, with this PR shipping the first one. The full strategy is documented in the testing-strategy spec under `docs/superpowers/specs/` (lands separately).

## Running tests locally

```bash
pnpm install
pnpm test:static    # static validators (no secrets needed)
pnpm test:mcp       # MCP contract tests (needs env vars; otherwise skipped)
pnpm test:install   # install lifecycle (CI-only; otherwise skipped)
pnpm test           # everything
```

To exercise the install lifecycle locally, set `CI=1` — **note this actually installs the plugin into your `~/.claude/plugins/` and removes it afterwards**. MCP contract tests have their own setup; see [MCP contract tests (local / manual)](#mcp-contract-tests-local--manual) below.

## Triggering CI manually

The workflow fires automatically on every PR and on push to `main`. You can also trigger it by hand:

- **GitHub UI**: Actions tab → **CI** workflow → **Run workflow** → pick a branch → Run. Useful when you want to re-run without pushing a new commit.
- **`gh` CLI**: `gh workflow run CI --ref <branch>`. Then watch with `gh run watch`.

## Tier 1: CI (this PR)

| Category | What it checks | Where it runs |
| --- | --- | --- |
| `ci/static/manifests.test.ts` | JSON schema for `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `.mcp.json`, `.codex/config.toml`. Cross-manifest consistency. | every PR in CI |
| `ci/static/skills.test.ts` | `SKILL.md` frontmatter, name-matches-folder, ≥ 3 trigger phrases in description | every PR in CI |
| `ci/static/links.test.ts` | All relative markdown links resolve | every PR in CI |
| `ci/static/widget.test.ts` | Widget tag template stays in sync with the `share` skill | every PR in CI |
| `ci/install-lifecycle/install.test.ts` | `npx plugins add` from local checkout + filesystem verify + cleanup | every PR in CI |
| `ci/mcp-contract/contract.test.ts` | All 7 MCP tools return shapes matching the saved schemas | **local / manual only** — see below |

## MCP contract tests (local / manual)

The Inflight MCP server (`https://mcp.inflight.co`) authenticates via OAuth 2.0 (RFC 9728); it does not issue personal access tokens. Session tokens are minted only via the OAuth PKCE flow (see `apps/api/src/routes/mcp.ts` in `inflight-vite`). We don't have a CI-friendly path to mint one today, so these tests aren't part of automated CI. Run them locally when the MCP wire format or response shape may have changed — e.g., before shipping a change that touches `apps/mcp` in `inflight-vite`, or when adding a new skill that depends on a new MCP field.

Add a checkbox for this to the pre-release manual QA workflow once that lands (planned in PR 2).

### Getting a session token

The cleanest way today: authenticate via Claude Code's `/mcp` flow against the test workspace, then read the freshly-inserted session token straight from Supabase.

1. In Claude Code, run `/mcp`, pick `plugin:inflight:inflight`, complete the OAuth in the browser
2. In the Inflight Supabase, run: `select session_token from mcp_sessions where user_id = '<your test user id>' order by created_at desc limit 1`
3. Export that token as `INFLIGHT_CI_TOKEN`

The token is long-lived (no `expires_at` unless explicitly set) so you only need to grab it once per test workspace, unless it gets revoked.

### Env vars for `pnpm test:mcp`

| Variable | Where to get it |
| --- | --- |
| `INFLIGHT_CI_TOKEN` | A captured `iflt_live_*` session token from `mcp_sessions` (see above) |
| `INFLIGHT_CI_PROJECT_ID` | ID of a project in the test workspace (used by `create_version` contract test) |
| `INFLIGHT_CI_SEEDED_VERSION_PUBLIC_ID` | Public ID of a seeded version (used by `get_version_report` contract test) |
| `INFLIGHT_CI_NEXT_STEP_ID` | ID of a seeded next step the server treats as idempotent on `complete` (used by `complete_next_step` contract test) |

### Setting up the test workspace (one-time)

1. Create a workspace at <https://www.inflight.co> (e.g., "CI - Inflight Plugin")
2. Create a project inside it; note the project ID → `INFLIGHT_CI_PROJECT_ID`
3. Create one version inside that project; note its `public_id` → `INFLIGHT_CI_SEEDED_VERSION_PUBLIC_ID`
4. Seed one next step on that version and copy its id → `INFLIGHT_CI_NEXT_STEP_ID`
5. Capture a session token via the OAuth flow above → `INFLIGHT_CI_TOKEN`

### Future work

Add an admin endpoint to `apps/api` that mints a long-lived session token for a designated CI service user. With that in place, this test can be promoted back into automated CI.

## Adding a new static validator

1. Pick a category (`ci/static/<thing>.test.ts`)
2. Add a deliberately broken fixture to `fixtures/` so you can prove the validator catches the bad case
3. Write a vitest `describe` block: one test per real file + one test against the fixture
4. Run `pnpm test:static -- <thing>` until it passes

## Adding a new MCP tool contract

1. Save the expected response shape to `ci/mcp-contract/schemas/<tool>.json` (JSON Schema, `additionalProperties: true`)
2. Add an `it("<tool>", ...)` block in `contract.test.ts` that calls the tool and validates the response against the schema
