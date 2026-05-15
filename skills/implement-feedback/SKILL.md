---
description: Act on design feedback from an Inflight version. Use when the user wants to apply feedback, fix review comments, implement feedback, go through comments, or act on feedback from reviewers. Triggers on 'apply feedback', 'fix the review', 'implement feedback', 'act on feedback', 'go through the comments'.
---

# Inflight: Act on Feedback

You are helping someone act on design feedback from their team. Communicate in plain language — describe visual outcomes, not code details. Say "I made the button bigger so it's easier to tap on mobile" not "I changed min-height to 44px in SubmitButton.tsx". The user can always ask for technical details if they want them.

## Step 1: Fetch Feedback

If the user provided a version ID or public ID (e.g., "$ARGUMENTS"), call `inflight_get_feedback` with it. Otherwise, call `inflight_list_versions` to show their recent versions and ask which one to act on.

The feedback is organized by **question** (the feedback guide hierarchy). Each question may have:
- **Question-level boosts:** Vibe checks (1-10 scores), polls (vote results), ship its (approval gate)
- **Discussion thread:** Chronological replies that can be text, text + element pin (with DOM forensics), recordings (with transcripts), or text + image attachments
- **Sub-replies:** Threaded responses within the discussion

## Hard Rules

1. **Do NOT implement anything until the Action Plan is approved.** Triage first.
2. **Read ALL feedback before presenting anything.** Every question, boost, response, and reply thread. You need the full picture to cross-reference. A vibe check in Question 1 is explained by element pins and recordings in that same question. A Ship It blocker connects to unresolved feedback elsewhere.
3. **Each question is a thematic thread.** Everything under a question is the team's response to that focus area. Multiple action items can emerge from one question.
4. **Only ask when the user's decision is needed.** If the team already resolved something in the thread, present the conclusion and move on.
5. **Use DOM context to find source code.** Element pins include DOM path, CSS selectors, semantic attributes (data-testid, role, aria-label), computed styles, and nearby elements. Use these to locate the exact component file.
6. **Cross-reference everything.** Connect feedback across questions. If a recording mentions the same issue as an element pin elsewhere, note the overlap. If Ship It blockers map to specific items, draw that line.

## Red Flags

| Thought | Reality |
|---------|---------|
| "This feedback is obvious, I'll just implement it" | Triage first. The thread may have resolved it differently. |
| "I'll batch all the small fixes together" | Each feedback item is its own commit and triage decision. |
| "Can't find the file from DOM path, I'll search broadly" | Use the exact selector, data-testid, class names first. Ask the user before broad search. |
| "The vibe check is low, I should fix it" | A vibe check isn't an action item. Fix the specifics under that question, the score follows. |
| "All feedback seems positive, we're done" | Check Ship It status. Not fully approved = unresolved work. |
| "I'll implement everything and let user review after" | Action plan must be approved BEFORE implementation. |

## Stop Conditions

**Halt and ask the user when:**
- You can't locate a source file after searching with DOM context
- Two feedback items contradict each other with no resolution in the thread
- A feedback item references a page/feature not in the codebase
- The fix requires an architectural change, not just styling
- The implementation would break existing tests

**Never:**
- Implement feedback the team explicitly marked as out of scope
- Guess at what a reviewer meant — ask for clarification
- Skip the action plan approval gate, no matter how small the changes
- Claim work is done without running verification
- Make changes to files you're not confident are correct

## Phase 1: Triage

Read every feedback item and its entire thread. Then classify each question:

- **Resolved** — Team discussed and reached a conclusion. No user input needed.
- **Unresolved disagreement** — Reviewers disagree, no conclusion. Needs user's call.
- **Clear actionable** — Points to specific fixes, team aligned. Confirm approach with user.
- **Decision made** — Poll or ship-it has a clear result. Present for confirmation.
- **Low signal** — Vibe check 7+/10, positive comments only. Acknowledge and move on.
- **Ambiguous** — Unclear what's being asked. Flag for clarification.

### Present the Triage

Start with a high-level overview of the entire feedback guide — how many questions, reviewers, what's resolved vs needs input.

Then walk through:

**1. Resolved items first (batch and confirm fast):**
Present all resolved items together. "These were already resolved in the threads: [list]. Sound right?" One quick confirm.

**2. Actionable items (grouped by question):**

For each question with actionable feedback:

*Vibe Check context:*
Don't triage the score alone. It provides context. "This scored X/10. Let's look at the discussion to understand what's driving it."

*Discussion replies — handle by type:*

- **Element Pin (has DOM context):** Quote the feedback, show key DOM context (path, selector, styles, viewport). Search the codebase to find the source file. Check sub-replies for team consensus. Propose approach.
- **Recording:** Present each timestamped issue separately from the transcript. You can't watch the video — work from transcript and timestamped comments only.
- **Text reply (no DOM context):** Try to infer code location from the content. If can't, ask user.
- **Image attachment:** Reference the image in your proposed approach if you can view it.

*After all items in a question, summarize back to the vibe check:*
"The low score seems driven by [specific issues]. Addressing those should move it up."

**3. Unresolved disagreements:**
"[Reviewer A] thinks X, [Reviewer B] thinks Y. No resolution in the thread. Your call?"

**4. Ship It status (last):**
Connect blockers to specific feedback items. "[Reviewer] hasn't approved — their open items are [X] and [Y]. Addressing those likely unblocks their approval."

**Positive feedback — weave in naturally, don't stop for it.**

## Phase 2: Action Plan

After triage, produce:

```
## Action Plan

### Will Implement
1. **[Description]** — [Approach]
   Source: Question [#], [reviewer]
   Files: [expected files]

### Skipped
- **[Description]** — [Reason]

### Out of Scope
- **[Description]** — [Why]

### Needs More Discussion
- **[Description]** — [Open question]
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
- One commit per feedback item.
- Format: `fix: [what changed] (feedback from [reviewer])`

**Escalation:** If a change is more complex than expected, would break something, or contradicts existing patterns — pause and tell the user before proceeding.

## Phase 4: Verify and Summarize

**Do NOT claim work is done until verified.**

1. Run build, lint, type-check. All must pass.
2. Run tests for modified files if they exist.
3. Fix any failures before presenting the summary.
4. **Self-review:** Re-read each feedback item from the triage and confirm your change actually addresses it. If you realize a change missed the point, fix it before presenting the summary.

When verified:

```
## Implementation Summary

| # | Feedback | Reviewer | File(s) Changed | What Changed |
|---|----------|----------|-----------------|--------------|
| 1 | [feedback] | [reviewer] | [files] | [change] |

**Addressed:** X of Y actionable items
**Verification:** Build ✓ | Lint ✓ | Types ✓

### Ship It Status
[Reviewer]'s blockers: ✓ addressed
Recommend re-requesting review.
```

Push the changes and tell the user the preview deployment will update automatically.
