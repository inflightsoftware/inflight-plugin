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

To exercise the MCP contract tests locally, export the four `INFLIGHT_CI_*` env vars listed below before `pnpm test:mcp`. To exercise the install lifecycle locally, set `CI=1` — **note this actually installs the plugin into your `~/.claude/plugins/` and removes it afterwards**, so prefer running it in CI.

## Triggering CI manually

The workflow fires automatically on every PR and on push to `main`. You can also trigger it by hand:

- **GitHub UI**: Actions tab → **CI** workflow → **Run workflow** → pick a branch → Run. Useful when you want to re-run without pushing a new commit (e.g., after rotating secrets).
- **`gh` CLI**: `gh workflow run CI --ref <branch>`. Then watch with `gh run watch`.

The MCP contract and install lifecycle jobs run on every PR; they only do meaningful work if the appropriate secrets / env are present (see below).

## Tier 1: CI (this PR)

| Category | What it checks | Runs in CI on |
| --- | --- | --- |
| `ci/static/manifests.test.ts` | JSON schema for `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `.mcp.json`, `.codex/config.toml`. Cross-manifest consistency. | every PR |
| `ci/static/skills.test.ts` | `SKILL.md` frontmatter, name-matches-folder, ≥ 3 trigger phrases in description | every PR |
| `ci/static/links.test.ts` | All relative markdown links resolve | every PR |
| `ci/static/widget.test.ts` | Widget tag template stays in sync with the `share` skill | every PR |
| `ci/mcp-contract/contract.test.ts` | All 7 MCP tools return shapes matching the saved schemas | every PR |
| `ci/install-lifecycle/install.test.ts` | `npx plugins add` from local checkout + filesystem verify + cleanup | every PR |

## Required GitHub secrets

Set these in **Settings → Secrets and variables → Actions**:

| Secret | Where to get it |
| --- | --- |
| `INFLIGHT_CI_TOKEN` | Personal access token for the CI workspace |
| `INFLIGHT_CI_PROJECT_ID` | ID of a project in the CI workspace (used by `create_version` contract test) |
| `INFLIGHT_CI_SEEDED_VERSION_PUBLIC_ID` | Public ID of a seeded version (used by `get_version_report` contract test) |
| `INFLIGHT_CI_NEXT_STEP_ID` | ID of a seeded next step that the server treats as idempotent on `complete` (used by `complete_next_step` contract test) |

## Setting up the CI workspace (one-time)

1. Create a workspace at https://www.inflight.co (e.g., "CI - Inflight Plugin")
2. Create a project inside it; note the project ID → `INFLIGHT_CI_PROJECT_ID`
3. Create one version inside that project; note its `public_id` → `INFLIGHT_CI_SEEDED_VERSION_PUBLIC_ID`
4. Seed one next step on that version and copy its id → `INFLIGHT_CI_NEXT_STEP_ID`
5. Generate a CI token scoped to this workspace → `INFLIGHT_CI_TOKEN`

## Adding a new static validator

1. Pick a category (`ci/static/<thing>.test.ts`)
2. Add a deliberately broken fixture to `fixtures/` so you can prove the validator catches the bad case
3. Write a vitest `describe` block: one test per real file + one test against the fixture
4. Run `pnpm test:static -- <thing>` until it passes

## Adding a new MCP tool contract

1. Save the expected response shape to `ci/mcp-contract/schemas/<tool>.json` (JSON Schema, `additionalProperties: true`)
2. Add an `it("<tool>", ...)` block in `contract.test.ts` that calls the tool and validates the response against the schema
