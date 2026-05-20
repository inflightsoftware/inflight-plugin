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
