# Plugin Testing Strategy — Design

**Date:** 2026-05-25
**Status:** Approved for planning
**Author:** Carter Price (with Claude)

## Problem

The Inflight plugin ships to three hosts (Claude Code, Cursor, Codex) and exposes a real MCP server plus two LLM-driven skills (`share`, `review`). Today there is no automated regression coverage. We need:

- Install/uninstall coverage across all three hosts
- MCP connection and tool-contract coverage
- End-to-end coverage of both skills
- Something cheap enough to run on every PR, with deeper coverage somewhere
- A repeatable runbook for QA before releases

## Goals

- Fast feedback on PRs (< 2 min CI, no perceptible LLM cost)
- High-confidence nightly regression catch for the full skill flows
- Manual QA path for surfaces automation cannot reach (Cursor/Codex GUI)
- Clear failure signals — never silent regressions

## Non-Goals

- Byte-exact assertions on agent message text (LLM drift makes these brittle)
- Per-commit deep e2e (cost and time prohibitive)
- Testing the Inflight web app itself (out of scope; that is `inflight-web`'s problem)

## Approach: Tiered pyramid

Three layers, each answering a different question:

| Tier | Trigger | Duration | Cost/run | Question it answers |
| --- | --- | --- | --- | --- |
| **CI** | Every PR | < 2 min | $0 (no LLM) | Is the plugin well-formed and does the MCP contract still hold? |
| **Nightly** | Cron 2 AM PT + manual | 20–40 min | ~$2–4 | Do skill edge cases work, and does the full agent flow still work against real Vercel/Netlify/Inflight on both Claude Code CLI and Codex CLI? |
| **Manual QA** | Pre-release | ~25 min | Human time | Does it install and work in the Claude Code, Cursor, and Codex GUIs? |

The pyramid is intentional: lots of cheap fast tests at the bottom, fewer expensive tests above, and a thin manual layer on top for what automation cannot reach.

## Architecture

### Repository layout

```text
inflight-plugin/
├── tests/
│   ├── ci/                          # Runs on every PR (no LLM, deterministic)
│   │   ├── static/                  # JSON schema, frontmatter, link/widget rules
│   │   ├── mcp-contract/            # Direct HTTP calls to mcp.inflight.co
│   │   └── install-lifecycle/       # Headless Claude Code install/uninstall
│   ├── nightly/                     # Scheduled, real LLM
│   │   ├── mocked/                  # Sub-tier A: Agent SDK + stubbed MCP, no deployment
│   │   ├── e2e/                     # Sub-tier B: Agent SDK against real fixtures
│   │   │   ├── scenarios/           # YAML scenarios: prompt + assertions
│   │   │   ├── fixtures/            # References to deployed fixture repos
│   │   │   └── hosts/               # Runners for Claude Code CLI + Codex CLI
│   │   └── harness/                 # Shared Agent SDK driver + assertion library
│   └── manual/
│       └── release-checklist.md     # ~25 min Claude Code + Cursor + Codex GUI runbook
└── .github/workflows/
    ├── ci.yml                       # PR trigger
    └── nightly.yml                  # cron + workflow_dispatch
```

External (not in this repo):

```text
inflightsoftware/
├── inflight-fixture-vercel          # Tiny Next.js app, deployed to Vercel
└── inflight-fixture-netlify         # Same, deployed to Netlify
```

## Tier 1: CI (every PR, no LLM, < 2 min)

Deterministic only. No LLM calls — that keeps CI fast, free, and free of flake. Anything that needs an agent runtime moves to nightly.

### 1a. Static validators

Pure Node script, no network, no LLM. Catches the most common class of regression: someone hand-edits a manifest or skill file and breaks something subtle.

- **JSON validity + schema** for `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `.mcp.json`, `.codex/config.toml`
- **Cross-manifest consistency** — all three host manifests share the same `version` and `repository`; declared `skills` paths resolve
- **Skill frontmatter** — every `SKILL.md` has `name`, `description`, `allowed-tools`; name matches folder
- **Skill triggering hygiene** — `description` contains at least three example trigger phrases (protects against accidental deletion of these)
- **Internal links** — referenced files (`troubleshooting.md`, etc.) exist; no dangling markdown links
- **Widget tag rule** — the documented `<script src="https://www.inflight.co/widget.js" data-workspace="...">` template the `share` skill emits matches the regex the same skill uses to detect/repair. Prevents recurrence of the bug fixed in commit `53fbb99`.

### 1b. MCP contract tests

A small script hits `https://mcp.inflight.co` directly with a CI-only token. One call per tool, asserts response shape against a saved schema:

- `inflight_get_workspaces` → array with `widget_id`, `is_default`, `name`, `id`
- `inflight_set_default_workspace` → success shape
- `inflight_list_recent_projects` → array shape
- `inflight_list_versions` → array shape
- `inflight_get_version_report` → has `feedback_context` and `next_steps`, each next step has `title`, `description`, `status`
- `inflight_create_version` → returns version id + public id
- `inflight_complete_next_step` → success shape

**Why**: skill prompts hardcode field names. If the server renames `widget_id` to `widgetId`, skills break silently. This test fails loudly the moment the contract drifts.

### 1c. Install lifecycle (Claude Code only in CI)

Headless smoke test using whichever Claude Code install mechanism is scriptable (the README uses `npx plugins add inflightsoftware/inflight-plugin`; implementation plan will verify the exact CLI surface).

Expected shape:

```bash
# install plugin from local checkout
# assert: skills appear in plugin list
# assert: MCP server registered in host config
# uninstall plugin
# assert: skills gone; MCP entry removed; plugin directory removed
```

Cursor and Codex have no headless install path — they go to the manual checklist.

## Tier 2: Nightly (real LLM, 20–40 min, ~$2–4/run)

Two sub-tiers, both LLM-driven, both run on the same nightly schedule:

- **2A. Mocked edge cases** — Agent SDK against stub MCP + temp git repos. No deployments. ~$0.01 total per night. Catches skill-prompt regressions on hard-to-provoke edge cases.
- **2B. Real e2e** — Agent SDK against deployed fixture apps + real Inflight MCP. ~$1–2 per night. Catches real-world integration breakage.

Both sub-tiers run scenarios against **both Claude Code CLI and Codex CLI** so we catch host-specific divergence. Cursor has no scriptable CLI runtime — it stays in the manual checklist.

### 2A. Mocked edge cases (no fixture apps)

High-value edge cases that are painful to provoke against real services. Runs the Agent SDK against a stubbed MCP and an inline-constructed temp git fixture. **Uses Haiku 4.5** to keep cost negligible (~$0.001/scenario).

Initial set (~5 scenarios, ~30s each):

- `share` handles `workspace_selection_required` error correctly (asks user, calls `set_default_workspace`)
- `share` detects widget tag with wrong `data-workspace`, rewrites only that attribute
- `share` in detached HEAD asks user to check out a branch instead of pushing
- `share` with both `.vercel/project.json` and `.netlify/state.json` asks which to use
- `review` enforces the "no implementation before action plan approved" gate
- `review` skips next steps already marked `completed`

These need: Agent SDK runtime + an LLM key + a tiny in-process stub MCP server + an `os.tmpdir()` git repo. No deployments. **Assertions on tool-call sequences, not message text** — stable across LLM minor drift.

**Promotion path**: if these turn out to be deterministic enough in practice (no flakes for a month), they can be promoted into CI later. Default placement is nightly.

### 2B. Real e2e (against deployed fixtures)

### 2B.1 Fixture apps

Two minimal Next.js apps in separate repos owned by the CI org:

- **`inflight-fixture-vercel`** — clean Next.js 16 app deployed to a CI-owned Vercel project, widget tag installed correctly
- **`inflight-fixture-netlify`** — same app deployed to Netlify under a CI account

Separate repos (not subdirectories) because the `share` skill runs `git status` / `git push` and needs real remotes. Each nightly run resets fixtures to a known commit for idempotency.

### 2B.2 Scenario format

Each scenario is a YAML file the harness loads:

```yaml
name: share-skill-vercel-happy-path
fixture: inflight-fixture-vercel
preconditions:
  reset_to_commit: main
  ensure_widget_tag: correct
  vercel_auth: from_env
prompt: "share my work for review"
assertions:
  tool_calls_include:
    - inflight_get_workspaces
    - inflight_create_version
  files_unchanged: ["app/layout.tsx"]
  exit_state: success
  created_version_has:
    branch: matches_current
    commit_sha: matches_HEAD
```

Harness flow:

1. Reset the fixture repo to precondition state
2. Boot an Agent SDK session with the plugin loaded (one run per host CLI — Claude Code and Codex)
3. Send the prompt
4. Record every tool call, file mutation, git operation
5. Assert against the YAML

Each scenario therefore runs twice per night (once per host CLI). If a scenario is host-specific (rare — should be the exception), it declares `hosts: [claude-code]` or `hosts: [codex]` in YAML.

### 2B.3 Scenario inventory (initial)

**`share` skill** (5–7 scenarios):

- Vercel happy path (correct widget, clean git, single workspace)
- Netlify happy path
- Widget tag missing → skill installs it, commits, pushes
- Widget tag has wrong `data-workspace` → skill rewrites only that attribute
- Uncommitted changes → skill offers to commit & push
- Manual URL paste (no provider files) → skill skips git/provider steps
- Multiple workspaces, no default → skill asks, calls `set_default_workspace`

**`review` skill** (4–5 scenarios):

- Single matching version (branch match) → auto-selects, shows triage
- Multiple version candidates → asks user to pick
- All next steps `completed` → skill reports done, exits cleanly
- Mixed pending/completed → only triages pending
- Action plan approval gate enforced (rejects implementation before approval)

For `review`, seeded feedback in the test Inflight workspace stays static — easier to assert against than dynamic data.

### 2B.4 Assertion philosophy

Deliberately loose:

- **Tool call sequence**: required calls present, in roughly correct order. Allows extra exploratory reads.
- **File mutations**: specific files changed/unchanged, not byte-exact diffs.
- **Git state**: commits made, pushes performed, branch state.
- **Final outcome**: version created, report fetched, next step marked complete.

We do not assert on agent message text — that is where LLM drift creates false failures.

### 2C. Schedule + reporting (applies to both 2A and 2B)

- **Cron**: 2 AM PT daily (low MCP traffic)
- **Trigger**: also `workflow_dispatch` for on-demand
- **On failure**: auto-open a GitHub issue with scenario name, run link, last 100 lines of trace + Slack ping to release channel
- **On pass**: quiet (no notification noise)

## Tier 3: Manual QA checklist

Lives at `tests/manual/release-checklist.md`. Run before each release tag. ~25 minutes. Targets the three GUI surfaces — **Claude Code (desktop / IDE extension), Cursor, Codex** — that no CLI-driven test reaches. Nightly already covers the Claude Code and Codex CLIs, so this tier focuses on what a real human installing via UI experiences.

### Preconditions (do these FIRST — failures invalidate the run)

- [ ] **Clean Claude Code state (CLI + GUI)**: in CLI, `claude plugin uninstall inflight` if present; in desktop/IDE extension, uninstall via the plugins UI; verify `claude plugin list` no longer shows it; check `~/.claude/plugins/` has no `inflight*` directory; restart the IDE extension
- [ ] **Clean Cursor state**: Settings > Plugins → uninstall Inflight if installed; restart Cursor; confirm Inflight skills no longer appear in command palette
- [ ] **Clean Codex state (CLI + GUI)**: uninstall via Codex's plugin UI if present; remove `~/.codex/plugins/inflight*` (or equivalent); restart Codex; confirm skills + MCP gone
- [ ] **Clean MCP auth state**: revoke prior Inflight MCP auth tokens in each host's `/mcp` config so the auth flow is tested fresh
- [ ] **Fresh fixture branch**: `cd inflight-fixture-vercel && git checkout main && git reset --hard origin/main && git clean -fd` (same for Netlify fixture)
- [ ] **Inflight test workspace**: confirm it exists, you are a member, `widget_id` is known and recorded in the checklist
- [ ] **CLIs installed and logged in**: `vercel whoami`, `netlify status` both succeed under the test account
- [ ] **Record the build under test**: paste plugin version + git SHA at top of checklist run

### Install (per GUI host)

- [ ] **Claude Code (desktop / IDE extension)**: install via in-app plugin browser (or `npx plugins add inflightsoftware/inflight-plugin` if no GUI installer); version matches; `/inflight:share` and `/inflight:review` appear in slash menu; `/mcp` lists `plugin:inflight:inflight`
- [ ] **Cursor**: Settings > Plugins > search "Inflight" > Install → both skills appear; MCP shows in MCP panel
- [ ] **Codex (GUI)**: install via Codex's plugin UI → both skills + MCP present

### Smoke: `share` skill (per host)

In a fresh terminal in the Vercel fixture:

- [ ] Authenticate MCP via `/mcp` flow in browser
- [ ] Prompt: "share my work for review"
- [ ] Skill creates a version, shareable link appears, link opens to the deployed fixture URL
- [ ] Version visible in Inflight test workspace

### Smoke: `review` skill (per host)

- [ ] Prompt: "implement the feedback on my latest version"
- [ ] Skill fetches the seeded version, presents triage
- [ ] Approve action plan; skill makes one small change, marks next step complete
- [ ] Next step status flips to `completed` in Inflight

### Uninstall (per host)

- [ ] Uninstall via host's mechanism
- [ ] Skills removed from menu
- [ ] MCP entry removed from `/mcp` config
- [ ] Plugin directory (`~/.claude/plugins/inflight*` or host equivalent) gone
- [ ] Re-prompt skill triggers ("share my work") → no longer responds with Inflight skill

### Outcome

- [ ] All boxes checked → release ready
- [ ] Any failure → file issue with checklist run attached, block release

## Operating concerns

### Secrets (GitHub Actions)

| Secret | Purpose |
| --- | --- |
| `INFLIGHT_CI_TOKEN` | Long-lived token scoped to the CI workspace; rotate quarterly |
| `INFLIGHT_CI_WIDGET_ID` | `widget_id` for assertions in scenarios |
| `ANTHROPIC_API_KEY` | Agent SDK runs in CI + nightly |
| `VERCEL_TOKEN` | Fixture deploys + Vercel CLI auth in nightly |
| `NETLIFY_AUTH_TOKEN` | Same for Netlify |
| `SLACK_WEBHOOK_URL` | Nightly failure notifications |

### Cost estimate

- **CI per PR**: $0 (no LLM at all)
- **Nightly 2A (mocked)**: ~$0.05 (5 scenarios × 2 host CLIs × Haiku 4.5)
- **Nightly 2B (real e2e)**: ~$2–4 (10–12 scenarios × 2 host CLIs × Sonnet × longer traces)
- **Monthly**: ~$60–120 + minor Vercel/Netlify fixture hosting

### Adding new scenarios

Documented in `tests/README.md`: pick tier (mocked-unit vs nightly), copy the nearest YAML, edit prompt + assertions, run locally with `pnpm test:nightly --scenario new-thing`.

### Failure investigation playbook

Each failed scenario writes a `traces/<scenario>-<timestamp>.json` artifact containing the full tool-call trace, file diffs, git operations, and final agent message. The artifact is auto-attached to the GitHub issue. First investigation step is always: open the trace.

## Implementation sequencing

Each tier ships as its own PR, in this order. Each builds on the prior but is independently mergeable:

1. **PR 1 — CI tier**: static validators, MCP contract tests, install lifecycle, `ci.yml` workflow. No LLM, no fixtures, no secrets beyond `INFLIGHT_CI_TOKEN`. Smallest, highest-leverage change — ships first.
2. **PR 2 — Manual QA checklist**: `tests/manual/release-checklist.md` only. Pure documentation. Can land in parallel with PR 1.
3. **PR 3 — Nightly 2A (mocked edge cases)**: Agent SDK harness, stub MCP, mocked scenarios, `nightly.yml` workflow (mocked-only at first). Adds `ANTHROPIC_API_KEY` secret. Sets up the harness that PR 4 reuses.
4. **PR 4 — Nightly 2B (real e2e)**: fixture-app references, real-MCP scenarios, Claude Code CLI + Codex CLI runners, Slack notifier, GitHub issue auto-filer. Largest PR — depends on fixture repos already existing.

**Pre-work outside this repo (track separately)**: stand up the two fixture repos and the throwaway Inflight workspace before PR 4 lands.

## Open Questions

None remaining as of design approval. Implementation plan will surface any new ones.

## Decisions Log

| Decision | Choice | Why |
| --- | --- | --- |
| Test architecture | Tiered pyramid (A + selective C) | Matches "cheap CI, deep nightly" goal |
| Mocked skill units placement | Nightly sub-tier 2A (not CI) | LLM runtime makes them too slow/non-deterministic for PR gate; promotion path back to CI later if they prove stable |
| Mocked units model | Haiku 4.5 | Sufficient for tool-call assertions; ~$0.001/scenario |
| MCP auth in CI | Long-lived test workspace token in Secrets | Simplest; rotate quarterly |
| Fixture management | Separate GitHub repos owned by CI | `share` needs real git remotes to push to |
| Nightly host coverage | Claude Code CLI + Codex CLI (both sub-tiers) | Both have scriptable runtimes; catches host-specific divergence |
| Manual QA host coverage | Claude Code GUI + Cursor GUI + Codex GUI | The three GUI paths no CLI test can reach |
| Nightly failure mode | GitHub issue + Slack ping | Persistent record + fast notification |
| Implementation sequencing | One PR per tier (4 PRs total) | Each tier is independently mergeable and provides value alone |
