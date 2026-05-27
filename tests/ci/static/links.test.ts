import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
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
