# Inflight Plugin for AI Coding Agents

Design feedback plugin for AI coding agents — share work for review, collect structured feedback, and implement changes.

## Installation

**Claude Code:**

```bash
npx plugins add inflightsoftware/inflight-plugin
```

**Cursor:**

Settings > Plugins > search "Inflight" > Install

## What it provides

| Component | Description |
|-----------|-------------|
| **2 skills** | Share work for review + act on feedback |
| **MCP tools** | List workspaces, projects, versions; create versions; get structured feedback |

## Skills

### `/inflight:share`

Share your current work for design review. Auto-detects your deployment provider (Vercel/Netlify), resolves the staging URL, generates an AI feedback guide from your changes, and creates a shareable version.

Triggers automatically when you say things like "share my work", "get feedback on this", or "publish for review".

### `/inflight:implement-feedback`

Act on design feedback from reviewers. Fetches all structured feedback (element pins with DOM context, polls, vibe checks, recordings with transcripts, discussions), triages interactively, builds an action plan, then implements changes.

Triggers automatically when you say things like "apply feedback", "fix the review comments", or "implement feedback".

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or [Cursor](https://www.cursor.com)
- An [Inflight](https://www.inflight.co) account

## Testing

CI runs two test categories on every PR:

- **Static validators** — manifest, skill frontmatter, internal link, widget template checks. No secrets required.
- **Install lifecycle** — installs the plugin from the local checkout via `npx plugins add`, verifies it appears under `~/.claude/plugins/`, then cleans up.

A third category — **MCP contract tests** — exists at `tests/ci/mcp-contract/` but is local/manual only. The Inflight MCP server uses OAuth (no personal access tokens), so we run those tests by hand against a captured session token whenever the MCP wire format may have changed. See [tests/README.md](tests/README.md) for instructions.

To run locally: `cd tests && pnpm install && pnpm test:static`.
