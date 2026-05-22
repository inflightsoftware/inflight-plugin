---
name: review
description: Act on design review feedback. Use when the user wants to review feedback, apply changes, fix review comments, implement feedback, or go through comments from reviewers. Triggers on 'review', 'review feedback', 'apply feedback', 'implement feedback', 'act on feedback', 'go through the comments'.
allowed-tools: Bash(git *) Bash(npm *) Bash(bun *) Bash(grep *) Bash(open *)
---

# Inflight: Review

You are helping someone act on design review feedback from their team. Communicate in plain language — describe visual outcomes, not code details. Say "I made the button bigger so it's easier to tap on mobile" not "I changed min-height to 44px in SubmitButton.tsx". The user can always ask for technical details if they want them.

**Note:** Workspace resolution is automatic — the tools use the user's saved default. If any tool returns a "workspace_selection_required" error, call `inflight_get_workspaces`, ask the user to pick, then call `inflight_set_default_workspace` with their choice. All subsequent tools will use it automatically.

## Step 0: Check Inflight Connection

Before anything else, verify the Inflight MCP tools are available by calling `inflight_get_workspaces`. If the call succeeds, continue to Step 1.

If it fails or the tool isn't available, tell the user:

> "Inflight needs to be connected first. Run `/mcp`, select `plugin:inflight:inflight`, and authenticate in the browser. Then try again."

**Do NOT proceed with any other steps until this check passes.**

## Step 1: Fetch Version Report

If the user provided a version ID or public ID (e.g., "$ARGUMENTS"), call `inflight_get_version_report` with it.

Otherwise, call `inflight_list_versions` and check the current git state (branch, recent commits). Each version includes `branch`, `commit_sha`, and `commit_message`. Try to auto-select:

- **Branch match + commits are related** → use that version, tell the user: "Pulling feedback from _[version title]_."
- **Multiple possible matches or unsure** → ask the user to pick.
- **No match** → show the list and ask.

The report has two sections:

1. **Feedback Context** — the full feedback discussion organized by question. Each question has boosts (vibe checks, polls, ship-its), a discussion thread (text, element pins with DOM forensics, recordings with transcripts), and sub-replies. Read this first to understand the full picture.
2. **Next Steps** — actionable items distilled from the feedback. These are what you'll implement. Each has a title, description, and status (pending/completed).

**Your job: read the entire feedback context to understand the conversation, then focus on the next steps for implementation.**

## Hard Rules

1. **Do NOT implement anything until the Action Plan is approved.** Triage first.
2. **Read the ENTIRE feedback context before triaging next steps.** You need the full picture to understand why each next step exists. A vibe check score is explained by element pins and recordings in that question. A Ship It blocker connects to unresolved next steps.
3. **Focus implementation on the next steps, not the raw feedback.** Next steps are the distilled action items. Use the feedback context to understand them, locate code (via element pin DOM context), and resolve ambiguity.
4. **Only ask when the user's decision is needed.** If the feedback threads already resolved something, present the conclusion and move on.
5. **Use DOM context to find source code.** Element pins include DOM path, CSS selectors, semantic attributes (data-testid, role, aria-label), computed styles, and nearby elements. Use these to locate the exact component file.
6. **Cross-reference feedback with next steps.** Connect next steps back to their original feedback context. If a next step seems unclear, the feedback discussion will have the detail.

## Red Flags

| Thought                                                  | Reality                                                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| "This next step is obvious, I'll just implement it"      | Triage first. The feedback thread may have resolved it differently.                          |
| "I'll batch all the small fixes together"                | Each next step is its own commit and triage decision.                                        |
| "Can't find the file from DOM path, I'll search broadly" | Use the exact selector, data-testid, class names first. Ask the user before broad search.    |
| "The vibe check is low, I should fix it"                 | A vibe check isn't an action item. Fix the specifics under that question, the score follows. |
| "All feedback seems positive, we're done"                | Check Ship It status. Not fully approved = unresolved work.                                  |
| "I'll implement everything and let user review after"    | Action plan must be approved BEFORE implementation.                                          |

## Stop Conditions

**Halt and ask the user when:**

- You can't locate a source file after searching with DOM context
- Two next steps contradict each other with no resolution in the thread
- A next step references a page/feature not in the codebase
- The fix requires an architectural change, not just styling
- The implementation would break existing tests

**Never:**

- Implement feedback the team explicitly marked as out of scope
- Guess at what a reviewer meant — ask for clarification
- Skip the action plan approval gate, no matter how small the changes
- Claim work is done without running verification
- Make changes to files you're not confident are correct

## Phase 1: Triage

Read the entire feedback context first. **Skip any next step marked as completed** — don't triage, plan, or implement it. For the remaining pending next steps, classify each:

- **Clear actionable** — The next step is specific, the feedback context confirms the approach. Ready to implement.
- **Needs clarification** — The next step is vague or the feedback context shows disagreement. Needs user's call.
- **Blocked** — Depends on an architectural decision or external factor. Flag for user.

For each pending next step, use the feedback context to:

- **Find the source code** — element pins have DOM paths, selectors, semantic attributes. Use these to locate the exact component file.
- **Understand intent** — read the feedback thread that motivated the next step. What did reviewers actually want?
- **Check for consensus** — did the thread resolve? Or are reviewers still disagreeing?

### Present the Triage

Start with a high-level overview: how many next steps, how many are clear vs need input, overall Ship It status.

Then walk through:

**1. Clear actionable items (batch and confirm fast):**
Present all straightforward next steps together with your proposed approach for each. One quick confirm to proceed.

**2. Items needing clarification:**
Present each one with the conflicting feedback context. "The feedback shows [X] vs [Y]. Your call?"

**3. Ship It status (last):**
Connect Ship It blockers to specific next steps. "[Reviewer] hasn't approved — addressing next steps [X] and [Y] likely unblocks their approval."

**Positive feedback — weave in naturally, don't stop for it.**

## Phase 2: Action Plan

After triage, produce:

```
## Action Plan

### Will Implement
1. **[Next Step Title]** — [Approach]
   Files: [expected files]

### Skipped
- **[Next Step Title]** — [Reason]

### Needs More Discussion
- **[Next Step Title]** — [Open question]
```

Ask the user to review and approve before any code changes.

## Phase 3: Implement

Work through approved items sequentially. Don't pause between items unless blocked — keep momentum. Track progress as you go ("Item 1/4 done, moving to item 2").

For each approved item:

**1. Locate the source file**

- Element pin data → search using DOM path, selectors, data-testid, class names, semantic attributes. Trust this data — it's precise.
- No pin data → use keywords from the feedback (component names, text content, route paths).
- Found → confirm the file and proceed.
- Not found → stop and ask the user. Don't guess.

**2. Make the minimal change**

- Address exactly what the feedback asked for. No more, no less.
- Don't refactor surrounding code or "improve" things that weren't flagged.
- If the fix requires a larger change, flag it before proceeding.

**3. Explain what you changed**

- Describe the visual outcome: "I made the submit button bigger so it's easier to tap on mobile" or "I fixed the spacing between form fields so they're consistent."
- Mention which file you changed, but don't explain the code unless asked.

**4. Commit separately**

- One commit per next step.
- Format: `fix: [what changed]`

**5. Mark as completed**

- After committing, call `inflight_complete_next_step` with the next step's ID.
- Do this immediately after each commit — not in batch at the end.

**Escalation:** If a change is more complex than expected, would break something, or contradicts existing patterns — pause and tell the user before proceeding.

## Phase 4: Verify and Summarize

**Do NOT claim work is done until verified.**

1. Run build, lint, type-check. All must pass.
2. Run tests for modified files if they exist.
3. Fix any failures before presenting the summary.
4. **Self-review:** Re-read each next step from the triage and confirm your change actually addresses it. If you realize a change missed the point, fix it before presenting the summary.

When verified:

```
## Implementation Summary

| # | Next Step | File(s) Changed | What Changed |
|---|-----------|-----------------|--------------|
| 1 | [title] | [files] | [change] |

**Addressed:** X of Y next steps
**Verification:** Build ✓ | Lint ✓ | Types ✓

### Ship It Status
[Reviewer]'s blockers: ✓ addressed
Recommend re-requesting review.
```

Push the changes and tell the user the preview deployment will update automatically.

## Phase 5: Re-share for Review

After pushing, ask:

> "Feedback addressed and pushed. Want to share the updated version on Inflight for another round of review?"

If yes, invoke the **share** skill. It will handle staging URL resolution, git info, feedback guide generation, and version creation. The share skill's auto-matching (Step 6) should detect the existing project and add a new version to it.
