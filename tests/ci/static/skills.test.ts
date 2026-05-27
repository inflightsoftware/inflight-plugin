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

type ValidationResult =
  | {
      valid: true;
      data: Required<SkillFrontmatter>;
    }
  | {
      valid: false;
      reason: string;
    };

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
