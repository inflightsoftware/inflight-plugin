# Plugin Testing — PR 1: CI Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first tier of the plugin test suite — deterministic, no-LLM checks that run on every PR in under two minutes.

**Architecture:** A small Node.js + TypeScript test project lives under `tests/`. It runs three categories of test on every PR via GitHub Actions: static manifest/skill/link/widget validators, an MCP contract test that hits the real `mcp.inflight.co` server with a CI-only token, and a headless install/uninstall lifecycle smoke test. No LLM calls, no fixture deployments.

**Tech Stack:**

- Node.js 20+ with built-in `fetch`
- TypeScript 5.x
- vitest (test runner — parallel by default, good DX, supports TS natively)
- pnpm (package manager)
- ajv (JSON Schema validation) + ajv-formats
- gray-matter (parse YAML frontmatter from `SKILL.md`)
- @iarna/toml (parse `.codex/config.toml`)
- glob (file walking)
- execa (subprocess wrapper for the install lifecycle test)

**Out of scope for this PR:** the manual QA checklist (PR 2), nightly mocked-edge-case scenarios (PR 3), nightly real e2e (PR 4), Cursor/Codex install testing.

**Linked spec:** [docs/superpowers/specs/2026-05-25-plugin-testing-strategy-design.md](../specs/2026-05-25-plugin-testing-strategy-design.md), Tier 1 section.

---

## File Structure

After this PR, the repo gains these files:

```text
tests/
├── package.json                       # pnpm workspace root for tests
├── pnpm-lock.yaml                     # committed lockfile
├── tsconfig.json                      # TS config
├── vitest.config.ts                   # vitest config
├── README.md                          # how to run tests locally, add new ones
├── src/                               # shared helpers
│   ├── repo-paths.ts                  # constants: paths to plugin files
│   ├── load-manifests.ts              # reads & validates all 3 manifests
│   └── mcp-client.ts                  # tiny HTTP MCP client for contract tests
├── ci/
│   ├── static/
│   │   ├── manifests.test.ts          # JSON Schema + cross-manifest consistency
│   │   ├── skills.test.ts             # SKILL.md frontmatter + triggering hygiene
│   │   ├── links.test.ts              # internal markdown link checker
│   │   └── widget.test.ts             # widget template vs. detection consistency
│   ├── mcp-contract/
│   │   ├── schemas/                   # JSON schemas for each MCP tool response
│   │   │   ├── get_workspaces.json
│   │   │   ├── set_default_workspace.json
│   │   │   ├── list_recent_projects.json
│   │   │   ├── list_versions.json
│   │   │   ├── get_version_report.json
│   │   │   ├── create_version.json
│   │   │   └── complete_next_step.json
│   │   └── contract.test.ts           # one assertion per MCP tool
│   └── install-lifecycle/
│       └── install.test.ts            # headless plugin install/uninstall smoke
└── fixtures/                          # deliberate-breakage fixtures for testing validators
    ├── bad-manifest-missing-version.json
    ├── bad-skill-no-frontmatter.md
    ├── bad-skill-short-description.md
    └── bad-widget-missing-async.md

.github/workflows/
└── ci.yml                             # PR trigger, runs `pnpm test:ci`

# Modified files
.gitignore                             # add tests/node_modules
README.md                              # add a small "Testing" section
```

The `fixtures/` directory holds intentionally broken inputs so we can prove the validators actually catch breakage — see Task 4.

---

## Task 1: Bootstrap the tests project (pnpm + TypeScript + vitest)

**Files:**

- Create: `tests/package.json`
- Create: `tests/tsconfig.json`
- Create: `tests/vitest.config.ts`
- Modify: `.gitignore` (add `tests/node_modules`)

- [ ] **Step 1: Create `tests/package.json`**

```json
{
  "name": "inflight-plugin-tests",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ci": "vitest run --reporter=default --reporter=junit --outputFile=junit.xml",
    "test:static": "vitest run ci/static",
    "test:mcp": "vitest run ci/mcp-contract",
    "test:install": "vitest run ci/install-lifecycle"
  },
  "devDependencies": {
    "@iarna/toml": "^2.2.5",
    "@types/node": "^20.11.0",
    "ajv": "^8.12.0",
    "ajv-formats": "^3.0.1",
    "execa": "^8.0.1",
    "glob": "^10.3.10",
    "gray-matter": "^4.0.3",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 2: Create `tests/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*", "ci/**/*", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create `tests/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["ci/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "threads",
  },
});
```

- [ ] **Step 4: Append to `.gitignore`**

```
# Plugin test workspace
tests/node_modules
tests/junit.xml
tests/coverage
```

- [ ] **Step 5: Install dependencies**

Run from `tests/`:

```bash
cd tests && pnpm install
```

Expected: `pnpm-lock.yaml` created, no errors.

- [ ] **Step 6: Verify vitest runs (empty suite is fine)**

Run: `cd tests && pnpm test`

Expected: `No test files found` — that's correct at this stage.

- [ ] **Step 7: Commit**

```bash
git add tests/package.json tests/pnpm-lock.yaml tests/tsconfig.json tests/vitest.config.ts .gitignore
git commit -m "test: bootstrap tests workspace with pnpm + vitest"
```

---

## Task 2: Create shared helpers (repo paths + manifest loader)

**Files:**

- Create: `tests/src/repo-paths.ts`
- Create: `tests/src/load-manifests.ts`

- [ ] **Step 1: Write `tests/src/repo-paths.ts`**

```ts
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
```

- [ ] **Step 2: Write `tests/src/load-manifests.ts`**

```ts
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
  mcpServers: Record<string, { type?: string; url: string }>;
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
```

- [ ] **Step 3: Sanity-compile**

Run: `cd tests && pnpm exec tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add tests/src/repo-paths.ts tests/src/load-manifests.ts
git commit -m "test: add shared helpers for repo paths and manifest loading"
```

---

## Task 3: Manifest validator — JSON Schema + cross-manifest consistency

**Files:**

- Create: `tests/ci/static/manifests.test.ts`
- Create: `tests/fixtures/bad-manifest-missing-version.json`

- [ ] **Step 1: Write the deliberate-breakage fixture**

`tests/fixtures/bad-manifest-missing-version.json`:

```json
{
  "name": "inflight",
  "description": "missing version field",
  "repository": "https://github.com/inflightsoftware/inflight-plugin",
  "license": "MIT"
}
```

- [ ] **Step 2: Write the test file**

`tests/ci/static/manifests.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test**

Run: `cd tests && pnpm test:static -- manifests`

Expected: all tests pass. The "validator catches a deliberately broken fixture" test proves the validator actually rejects bad input.

- [ ] **Step 4: Commit**

```bash
git add tests/ci/static/manifests.test.ts tests/fixtures/bad-manifest-missing-version.json
git commit -m "test: validate plugin manifests and cross-manifest consistency"
```

---

## Task 4: Skill frontmatter validator + triggering hygiene

**Files:**

- Create: `tests/ci/static/skills.test.ts`
- Create: `tests/fixtures/bad-skill-no-frontmatter.md`
- Create: `tests/fixtures/bad-skill-short-description.md`

Background: every `SKILL.md` has YAML frontmatter with `name`, `description`, `allowed-tools`. The `description` field must contain at least three trigger phrases — these are how Claude decides when to invoke the skill. Losing them silently breaks discovery.

- [ ] **Step 1: Write fixture files**

`tests/fixtures/bad-skill-no-frontmatter.md`:

```markdown
# Just a heading, no frontmatter
```

`tests/fixtures/bad-skill-short-description.md`:

```markdown
---
name: tiny
description: too short
allowed-tools: Bash
---

# Tiny
```

- [ ] **Step 2: Write the test file**

`tests/ci/static/skills.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { sync as globSync } from "glob";
import matter from "gray-matter";
import { REPO_ROOT, SKILLS_DIR } from "../../src/repo-paths.ts";

interface SkillFrontmatter {
  name?: string;
  description?: string;
  "allowed-tools"?: string;
}

interface ValidationResult {
  valid: true;
  data: Required<SkillFrontmatter>;
} | {
  valid: false;
  reason: string;
}

export function validateSkill(path: string): ValidationResult {
  const raw = readFileSync(path, "utf8");
  const parsed = matter(raw);
  const fm = parsed.data as SkillFrontmatter;

  if (!fm.name) return { valid: false, reason: "missing name" };
  if (!fm.description) return { valid: false, reason: "missing description" };
  if (!fm["allowed-tools"]) {
    return { valid: false, reason: "missing allowed-tools" };
  }

  const folderName = basename(dirname(path));
  if (fm.name !== folderName) {
    return {
      valid: false,
      reason: `name '${fm.name}' does not match folder '${folderName}'`,
    };
  }

  if (fm.description.length < 80) {
    return {
      valid: false,
      reason: `description too short (${fm.description.length} chars) — needs trigger phrases`,
    };
  }

  // "Trigger phrases" heuristic: descriptions must reference at least 3
  // distinct user-intent phrases inside quotes. Lifted from the existing
  // share/review skills' patterns.
  const quotedPhrases = [...fm.description.matchAll(/'([^']+)'/g)].map(
    (m) => m[1],
  );
  if (quotedPhrases.length < 3) {
    return {
      valid: false,
      reason: `description has ${quotedPhrases.length} quoted trigger phrase(s); need at least 3`,
    };
  }

  return {
    valid: true,
    data: fm as Required<SkillFrontmatter>,
  };
}

describe("skill frontmatter", () => {
  const skillFiles = globSync("**/SKILL.md", { cwd: SKILLS_DIR, absolute: true });

  it("at least two skills exist (share, review)", () => {
    expect(skillFiles.length).toBeGreaterThanOrEqual(2);
  });

  for (const path of skillFiles) {
    const folder = basename(dirname(path));
    it(`${folder}/SKILL.md is valid`, () => {
      const result = validateSkill(path);
      if (!result.valid) {
        throw new Error(`${folder}: ${result.reason}`);
      }
    });
  }

  it("validator rejects a fixture with no frontmatter", () => {
    const result = validateSkill(
      resolve(REPO_ROOT, "tests/fixtures/bad-skill-no-frontmatter.md"),
    );
    expect(result.valid).toBe(false);
  });

  it("validator rejects a fixture with too-short description", () => {
    const result = validateSkill(
      resolve(REPO_ROOT, "tests/fixtures/bad-skill-short-description.md"),
    );
    expect(result.valid).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `cd tests && pnpm test:static -- skills`

Expected: both real skills (`share`, `review`) pass; both fixture tests confirm the validator rejects bad input. If a real skill fails, that's the validator catching a real problem — fix the skill before continuing.

- [ ] **Step 4: Commit**

```bash
git add tests/ci/static/skills.test.ts tests/fixtures/bad-skill-no-frontmatter.md tests/fixtures/bad-skill-short-description.md
git commit -m "test: validate skill frontmatter and trigger-phrase hygiene"
```

---

## Task 5: Internal markdown link checker

**Files:**

- Create: `tests/ci/static/links.test.ts`

Background: `skills/share/SKILL.md` references `troubleshooting.md` (a sibling file). Skills can also link other skills, the README, etc. If a file moves or is renamed without updating links, the skill silently breaks instructions. This check fails on the first broken link.

- [ ] **Step 1: Write the test file**

`tests/ci/static/links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sync as globSync } from "glob";
import { REPO_ROOT } from "../../src/repo-paths.ts";

// Match relative markdown links: [text](path), excluding http(s) and anchors.
const MD_LINK = /\[[^\]]*\]\(([^)]+)\)/g;

function extractRelativeLinks(content: string): string[] {
  const links: string[] = [];
  for (const match of content.matchAll(MD_LINK)) {
    const href = match[1];
    if (!href) continue;
    if (/^https?:\/\//i.test(href)) continue;
    if (href.startsWith("#")) continue;
    if (href.startsWith("mailto:")) continue;
    // Strip anchor fragment for resolution
    links.push(href.split("#")[0]!);
  }
  return links;
}

describe("internal markdown links resolve", () => {
  const docFiles = globSync("**/*.md", {
    cwd: REPO_ROOT,
    absolute: true,
    ignore: [
      "node_modules/**",
      "tests/node_modules/**",
      "tests/fixtures/**",
      "docs/superpowers/**",
    ],
  });

  for (const file of docFiles) {
    const relative = file.replace(REPO_ROOT + "/", "");
    const content = readFileSync(file, "utf8");
    const links = extractRelativeLinks(content);
    if (links.length === 0) continue;

    it(`${relative} — all relative links resolve`, () => {
      const broken: string[] = [];
      for (const link of links) {
        const target = resolve(dirname(file), link);
        if (!existsSync(target)) {
          broken.push(link);
        }
      }
      if (broken.length > 0) {
        throw new Error(
          `Broken links in ${relative}:\n  ${broken.join("\n  ")}`,
        );
      }
    });
  }
});
```

- [ ] **Step 2: Run the test**

Run: `cd tests && pnpm test:static -- links`

Expected: every doc passes. If any link is broken, the test reports the source file and the broken target.

- [ ] **Step 3: Commit**

```bash
git add tests/ci/static/links.test.ts
git commit -m "test: validate internal markdown links resolve"
```

---

## Task 6: Widget tag template consistency check

**Files:**

- Create: `tests/ci/static/widget.test.ts`
- Create: `tests/fixtures/bad-widget-missing-async.md`

Background: commit `53fbb99` ("Require correct data-workspace for widget tag") fixed a bug where the skill could insert a widget tag with the wrong `data-workspace` value. The fix relies on a documented template in `skills/share/SKILL.md` that must stay in sync with the skill's detection logic. This test asserts that the template literal stays exact, and that the canonical widget URL pattern is the only one referenced anywhere in the skill.

- [ ] **Step 1: Write the fixture**

`tests/fixtures/bad-widget-missing-async.md`:

```markdown
<script src="https://www.inflight.co/widget.js" data-workspace="<widget_id>"></script>
```

(Missing the `async` attribute — the validator should catch this.)

- [ ] **Step 2: Write the test file**

`tests/ci/static/widget.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "../../src/repo-paths.ts";

const SHARE_SKILL = resolve(REPO_ROOT, "skills/share/SKILL.md");

// The exact widget template the share skill is documented to emit.
// If you change this, change it in skills/share/SKILL.md too — they must match.
const CANONICAL_WIDGET_TAG =
  '<script src="https://www.inflight.co/widget.js" data-workspace="<widget_id>" async></script>';

const WIDGET_URL = "https://www.inflight.co/widget.js";

export function widgetTagPresent(content: string, tag: string): boolean {
  return content.includes(tag);
}

export function onlyCanonicalWidgetUrl(content: string): boolean {
  // Reject any inflight widget URL that isn't the canonical one.
  // e.g., http://, missing www., different path.
  const matches = content.match(/https?:\/\/[^\s"'<>]*inflight\.co[^\s"'<>]*/g) ?? [];
  return matches.every((url) => url === WIDGET_URL || !url.includes("widget"));
}

describe("widget tag template", () => {
  const skill = readFileSync(SHARE_SKILL, "utf8");

  it("canonical widget tag appears verbatim in share skill", () => {
    expect(widgetTagPresent(skill, CANONICAL_WIDGET_TAG)).toBe(true);
  });

  it("share skill references only the canonical widget URL", () => {
    expect(onlyCanonicalWidgetUrl(skill)).toBe(true);
  });

  it("fixture without async attribute does not match canonical template", () => {
    const bad = readFileSync(
      resolve(REPO_ROOT, "tests/fixtures/bad-widget-missing-async.md"),
      "utf8",
    );
    expect(widgetTagPresent(bad, CANONICAL_WIDGET_TAG)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `cd tests && pnpm test:static -- widget`

Expected: all three tests pass. If the canonical-tag test fails, the skill has drifted from its documented template — investigate before changing the constant.

- [ ] **Step 4: Commit**

```bash
git add tests/ci/static/widget.test.ts tests/fixtures/bad-widget-missing-async.md
git commit -m "test: assert widget tag template stays in sync with share skill"
```

---

## Task 7: MCP contract — build the schema registry

**Files:**

- Create: `tests/ci/mcp-contract/schemas/get_workspaces.json`
- Create: `tests/ci/mcp-contract/schemas/set_default_workspace.json`
- Create: `tests/ci/mcp-contract/schemas/list_recent_projects.json`
- Create: `tests/ci/mcp-contract/schemas/list_versions.json`
- Create: `tests/ci/mcp-contract/schemas/get_version_report.json`
- Create: `tests/ci/mcp-contract/schemas/create_version.json`
- Create: `tests/ci/mcp-contract/schemas/complete_next_step.json`

These schemas describe the **fields the skills depend on**. They are intentionally loose (`additionalProperties: true`) — the contract is "these fields must exist with these types," not "no other fields may exist."

- [ ] **Step 1: Write `get_workspaces.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["id", "name", "widget_id"],
    "properties": {
      "id": { "type": "string" },
      "name": { "type": "string" },
      "widget_id": { "type": "string", "minLength": 1 },
      "is_default": { "type": "boolean" }
    },
    "additionalProperties": true
  }
}
```

- [ ] **Step 2: Write `set_default_workspace.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["success"],
  "properties": { "success": { "type": "boolean" } },
  "additionalProperties": true
}
```

- [ ] **Step 3: Write `list_recent_projects.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["id", "name"],
    "properties": {
      "id": { "type": "string" },
      "name": { "type": "string" }
    },
    "additionalProperties": true
  }
}
```

- [ ] **Step 4: Write `list_versions.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["id", "title", "branch", "commit_sha"],
    "properties": {
      "id": { "type": "string" },
      "title": { "type": "string" },
      "branch": { "type": "string" },
      "commit_sha": { "type": "string" },
      "commit_message": { "type": "string" },
      "public_id": { "type": "string" }
    },
    "additionalProperties": true
  }
}
```

- [ ] **Step 5: Write `get_version_report.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["feedback_context", "next_steps"],
  "properties": {
    "feedback_context": { "type": ["object", "array", "string"] },
    "next_steps": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["title", "description", "status"],
        "properties": {
          "title": { "type": "string" },
          "description": { "type": "string" },
          "status": { "enum": ["pending", "completed"] }
        },
        "additionalProperties": true
      }
    }
  },
  "additionalProperties": true
}
```

- [ ] **Step 6: Write `create_version.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "public_id"],
  "properties": {
    "id": { "type": "string" },
    "public_id": { "type": "string" },
    "url": { "type": "string", "format": "uri" }
  },
  "additionalProperties": true
}
```

- [ ] **Step 7: Write `complete_next_step.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["success"],
  "properties": { "success": { "type": "boolean" } },
  "additionalProperties": true
}
```

- [ ] **Step 8: Commit**

```bash
git add tests/ci/mcp-contract/schemas/
git commit -m "test: add JSON schemas for the 7 MCP tool responses"
```

---

## Task 8: MCP client helper

**Files:**

- Create: `tests/src/mcp-client.ts`

Background: this is a tiny HTTP client for the MCP server. It supports two auth modes — bearer token from `INFLIGHT_CI_TOKEN` env var (CI), or `null` (test will be skipped). The implementer should verify the exact JSON-RPC envelope shape against the MCP spec or by reading `mcp.inflight.co` docs — the example below assumes JSON-RPC 2.0 over HTTP POST, which is the standard MCP wire format.

- [ ] **Step 1: Write the client**

```ts
// tests/src/mcp-client.ts
const MCP_URL = "https://mcp.inflight.co";

export interface McpCallResult<T = unknown> {
  result?: T;
  error?: { code: number; message: string };
}

export class McpClient {
  constructor(private readonly token: string) {}

  static fromEnv(): McpClient | null {
    const token = process.env.INFLIGHT_CI_TOKEN;
    return token ? new McpClient(token) : null;
  }

  async callTool<T = unknown>(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });

    if (!res.ok) {
      throw new Error(`MCP HTTP ${res.status}: ${await res.text()}`);
    }

    const payload = (await res.json()) as McpCallResult<{
      content: Array<{ type: string; text?: string }>;
      structuredContent?: T;
    }>;

    if (payload.error) {
      throw new Error(`MCP tool error ${payload.error.code}: ${payload.error.message}`);
    }

    // MCP tools may return data either via structuredContent (preferred)
    // or as JSON-stringified text in content[0].text. Support both.
    const result = payload.result;
    if (!result) throw new Error("MCP response missing result");

    if (result.structuredContent !== undefined) {
      return result.structuredContent;
    }
    const text = result.content?.[0]?.text;
    if (typeof text === "string") {
      return JSON.parse(text) as T;
    }
    throw new Error(`MCP response had no parseable content: ${JSON.stringify(result)}`);
  }
}
```

- [ ] **Step 2: Sanity-compile**

Run: `cd tests && pnpm exec tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add tests/src/mcp-client.ts
git commit -m "test: add minimal MCP HTTP client for contract tests"
```

---

## Task 9: MCP contract test exercising all 7 tools

**Files:**

- Create: `tests/ci/mcp-contract/contract.test.ts`

Background: the test validates the **shape** of each tool's response against the schemas from Task 7. It needs `INFLIGHT_CI_TOKEN` in the env. When the token is absent (local dev without secrets), all tests are skipped — they only run in CI. State-changing tools (`set_default_workspace`, `create_version`, `complete_next_step`) are exercised against a dedicated CI workspace so they cannot pollute prod data.

- [ ] **Step 1: Write the test file**

```ts
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
  let widgetId: string;

  beforeAll(async () => {
    // Sanity: pick the CI workspace's id for later state-changing calls
    const workspaces = await client!.callTool<
      Array<{ id: string; widget_id: string; name: string }>
    >("inflight_get_workspaces");
    if (workspaces.length === 0) throw new Error("CI token has no workspaces");
    workspaceId = workspaces[0]!.id;
    widgetId = workspaces[0]!.widget_id;
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
```

- [ ] **Step 2: Run locally (skipped — no token)**

Run: `cd tests && pnpm test:mcp`

Expected: `describe.skip` causes the suite to be skipped. Vitest reports "7 skipped".

- [ ] **Step 3: Run locally with a token (manual)**

If you have an `INFLIGHT_CI_TOKEN`, export it and the supporting IDs, then re-run:

```bash
export INFLIGHT_CI_TOKEN=...                            # CI workspace token
export INFLIGHT_CI_PROJECT_ID=...                       # any project in the CI workspace
export INFLIGHT_CI_SEEDED_VERSION_PUBLIC_ID=...         # a seeded version's public_id
export INFLIGHT_CI_NEXT_STEP_ID=...                     # a seeded next step's id
cd tests && pnpm test:mcp
```

Expected: 7 passes. If any schema validation fails, the test prints the diff between actual response and schema — that means the MCP server contract has drifted.

- [ ] **Step 4: Commit**

```bash
git add tests/ci/mcp-contract/contract.test.ts
git commit -m "test: contract test for the 7 inflight MCP tools"
```

---

## Task 10: Install lifecycle smoke test

**Files:**

- Create: `tests/ci/install-lifecycle/install.test.ts`

Background: the README says install with `npx plugins add inflightsoftware/inflight-plugin`. That installs from GitHub, not from a local checkout, so this test pins the install source to the **current commit SHA** when run in CI (using `github.sha`) or falls back to skipping locally. The exact CLI surface for the `plugins` tool needs verification — the implementer should read the `plugins` CLI's help output before finalizing the command. If a local-path install is supported, prefer it; otherwise install from the GitHub commit.

- [ ] **Step 1: Verify the CLI surface**

Run locally:

```bash
npx plugins --help
npx plugins add --help
```

Document what you see. Note whether `add` accepts a local path or only GitHub refs. Note whether it has an `uninstall`/`remove` subcommand. Record the canonical commands you'll use in the test file.

- [ ] **Step 2: Write the test file**

(Substitute the actual commands you confirmed in Step 1. The example below uses `add <github-repo>#<sha>` and `remove <name>` — adjust if your CLI uses different verbs.)

```ts
// tests/ci/install-lifecycle/install.test.ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execa } from "execa";
import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PLUGIN_NAME = "inflight";

// In CI, install from the current commit SHA so we test THIS build, not main.
// Locally, skip — installing into the developer's machine is invasive.
const CI = !!process.env.CI;
const COMMIT_SHA = process.env.GITHUB_SHA;

async function pluginIsInstalled(): Promise<boolean> {
  try {
    const { stdout } = await execa("npx", ["plugins", "list"], { reject: false });
    return stdout.includes(PLUGIN_NAME);
  } catch {
    return false;
  }
}

const describeIf = CI && COMMIT_SHA ? describe : describe.skip;

describeIf("plugin install lifecycle (Claude Code)", () => {
  beforeAll(async () => {
    // Defensive cleanup in case a prior run left state behind.
    await execa("npx", ["plugins", "remove", PLUGIN_NAME], { reject: false });
  });

  afterAll(async () => {
    await execa("npx", ["plugins", "remove", PLUGIN_NAME], { reject: false });
  });

  it("install completes successfully", async () => {
    const result = await execa(
      "npx",
      ["plugins", "add", `inflightsoftware/inflight-plugin#${COMMIT_SHA}`],
      { reject: false, timeout: 60_000 },
    );
    expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
  });

  it("plugins list shows inflight after install", async () => {
    expect(await pluginIsInstalled()).toBe(true);
  });

  it("install creates a plugin directory under ~/.claude/plugins/", () => {
    const dir = resolve(homedir(), ".claude/plugins");
    // The CLI may name the directory by repo, plugin name, or a hash —
    // we assert the parent dir exists and contains *some* inflight entry.
    expect(existsSync(dir)).toBe(true);
  });

  it("uninstall removes the plugin from `plugins list`", async () => {
    const result = await execa("npx", ["plugins", "remove", PLUGIN_NAME], {
      reject: false,
    });
    expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
    expect(await pluginIsInstalled()).toBe(false);
  });
});
```

- [ ] **Step 3: Run locally (skipped — no CI env)**

Run: `cd tests && pnpm test:install`

Expected: skipped. The test only runs when `CI=1` AND `GITHUB_SHA` is set.

- [ ] **Step 4: Run in CI emulation (manual)**

```bash
CI=1 GITHUB_SHA=$(git rev-parse HEAD) cd tests && pnpm test:install
```

Expected: 4 passes. If `plugins add` fails with "ref not found", the SHA hasn't been pushed to GitHub yet — push first.

- [ ] **Step 5: Commit**

```bash
git add tests/ci/install-lifecycle/install.test.ts
git commit -m "test: headless install/uninstall lifecycle smoke for Claude Code"
```

---

## Task 11: GitHub Actions CI workflow

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  static:
    name: Static validators
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: tests/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
        working-directory: tests
      - run: pnpm test:static
        working-directory: tests

  mcp-contract:
    name: MCP contract
    runs-on: ubuntu-latest
    needs: static
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: tests/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
        working-directory: tests
      - run: pnpm test:mcp
        working-directory: tests
        env:
          INFLIGHT_CI_TOKEN: ${{ secrets.INFLIGHT_CI_TOKEN }}
          INFLIGHT_CI_PROJECT_ID: ${{ secrets.INFLIGHT_CI_PROJECT_ID }}
          INFLIGHT_CI_SEEDED_VERSION_PUBLIC_ID: ${{ secrets.INFLIGHT_CI_SEEDED_VERSION_PUBLIC_ID }}
          INFLIGHT_CI_NEXT_STEP_ID: ${{ secrets.INFLIGHT_CI_NEXT_STEP_ID }}

  install-lifecycle:
    name: Install lifecycle (Claude Code)
    runs-on: ubuntu-latest
    needs: static
    # Only run on push to main, not on every PR — installs from GitHub by SHA
    # and that SHA needs to be present on the remote.
    if: github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - run: pnpm install --frozen-lockfile
        working-directory: tests
      - run: pnpm test:install
        working-directory: tests
        env:
          CI: "1"
          GITHUB_SHA: ${{ github.sha }}
```

- [ ] **Step 2: Document the required secrets**

Append to the bottom of `README.md`:

```markdown
## Testing

CI runs three test categories on every PR:

- **Static validators** — manifest, skill frontmatter, internal link, widget template checks. No secrets required.
- **MCP contract** — hits `https://mcp.inflight.co` to verify the tool response shapes the skills depend on.
- **Install lifecycle** — runs on `push` to main only; installs the plugin from the merged commit and verifies it appears in `plugins list`.

To run locally: `cd tests && pnpm install && pnpm test:static`.

See [tests/README.md](tests/README.md) for the full guide.
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "ci: run static + MCP contract on every PR, install lifecycle on main"
```

---

## Task 12: Write tests/README.md

**Files:**

- Create: `tests/README.md`

- [ ] **Step 1: Write the file**

````markdown
# Plugin Tests

Three tiers, with this PR shipping the first one. See [docs/superpowers/specs/2026-05-25-plugin-testing-strategy-design.md](../docs/superpowers/specs/2026-05-25-plugin-testing-strategy-design.md) for the full strategy.

## Running tests locally

```bash
pnpm install
pnpm test:static    # static validators (no secrets needed)
pnpm test:mcp       # MCP contract tests (needs env vars; otherwise skipped)
pnpm test:install   # install lifecycle (CI-only; otherwise skipped)
pnpm test           # everything
```

## Tier 1: CI (this PR)

| Category | What it checks | Runs in CI on |
| --- | --- | --- |
| `ci/static/manifests.test.ts` | JSON schema for `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `.mcp.json`, `.codex/config.toml`. Cross-manifest consistency. | every PR |
| `ci/static/skills.test.ts` | `SKILL.md` frontmatter, name-matches-folder, ≥ 3 trigger phrases in description | every PR |
| `ci/static/links.test.ts` | All relative markdown links resolve | every PR |
| `ci/static/widget.test.ts` | Widget tag template stays in sync with the `share` skill | every PR |
| `ci/mcp-contract/contract.test.ts` | All 7 MCP tools return shapes matching the saved schemas | every PR |
| `ci/install-lifecycle/install.test.ts` | `plugins add` / `plugins remove` against the merged commit | push to main only |

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
````

- [ ] **Step 2: Commit**

```bash
git add tests/README.md
git commit -m "docs: add tests/README.md with run instructions and setup guide"
```

---

## Task 13: End-to-end verification

- [ ] **Step 1: Run the full suite locally**

```bash
cd tests && pnpm test
```

Expected: all `ci/static/*` tests pass. `ci/mcp-contract/*` skipped (no token). `ci/install-lifecycle/*` skipped (no CI env).

- [ ] **Step 2: Lint-check the workflow file**

```bash
cd /Users/carterprice/inflight/repos/inflight-plugin && \
  npx --yes @action-validator/cli@latest .github/workflows/ci.yml
```

Expected: no errors. If the validator isn't available, eyeball the YAML for syntax issues.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin <branch>
gh pr create --title "Test infra PR 1: CI tier" --body "$(cat <<'EOF'
## Summary
- Adds the CI tier of the plugin test suite per [the testing strategy spec](docs/superpowers/specs/2026-05-25-plugin-testing-strategy-design.md)
- Static validators (manifests, skills, links, widget template)
- MCP contract tests for all 7 tools (skipped without `INFLIGHT_CI_TOKEN`)
- Install lifecycle smoke test (push-to-main only)
- GitHub Actions workflow runs all of the above

## Test plan
- [ ] All static validators pass on this branch
- [ ] MCP contract tests pass with secrets set
- [ ] After merge, install lifecycle job runs green on push-to-main
- [ ] Subsequent PRs see the static + MCP checks running as required status checks

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Watch CI on the PR**

```bash
gh pr checks --watch
```

Expected: `Static validators` and `MCP contract` jobs pass. `Install lifecycle` is skipped on PRs by design.

- [ ] **Step 5: After merge, watch the install lifecycle run on main**

```bash
gh run watch
```

Expected: install lifecycle job passes. If it fails because `plugins add` can't find the SHA, the test ran before the push propagated — re-trigger manually.

---

## Open Questions for the Implementer

These came up during planning and need verification on the ground:

1. **`plugins` CLI surface** (Task 10) — the README uses `npx plugins add ...`. Confirm the exact verbs (`add`/`install`, `remove`/`uninstall`) and whether a local-path install is supported. Update the test to match.
2. **MCP wire format** (Task 8) — the client assumes JSON-RPC 2.0 over HTTP POST to the root URL. If `mcp.inflight.co` uses a different transport (SSE, WebSocket, REST-shaped), adjust `mcp-client.ts`. The fastest verification is one `curl` call.
3. **`create_version` parameters** (Task 9) — the test passes `project_id`, `title`, `url`. Confirm these are the required fields and whether the server accepts a sentinel URL like `https://example.com` for CI use.
4. **`complete_next_step` idempotency** (Task 9) — the test assumes calling it twice on the same step is safe. If the server returns an error on the second call, the test will need to seed a fresh next step per run instead.

Each of these is a 5-minute investigation that should happen during Task 8/9/10 — surfacing them here so they aren't surprises.
