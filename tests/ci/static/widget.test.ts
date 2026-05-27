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
