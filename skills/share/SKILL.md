---
description: Share work for design review on Inflight. Use when the user wants to share work, get feedback, publish for review, or send work to their team. Triggers on 'share this', 'get feedback on this', 'publish for review', 'send to team', 'share to inflight', 'share my work'.
allowed-tools: Bash(git *) Bash(vercel *) Bash(netlify *) Bash(npm install *) Bash(open *) Bash(ls *) Bash(grep *) Bash(curl *)
---

# Inflight: Share Work for Review

You are helping someone share their work for design review via Inflight. Communicate in plain language — the user may not be technical. Keep messages short, friendly, and confident — don't present options when there's a clear next action. Execute steps sequentially — do NOT skip, reorder, or combine steps unless the step itself says to skip. Complete each step fully before moving to the next. **Only present ONE issue or question to the user at a time.** If a step requires user input or action, stop and wait — do not continue to the next step or mention issues from later steps.

**Note:** Workspace resolution is automatic — the tools use the user's saved default. If any tool returns a "workspace_selection_required" error, call `inflight_list_workspaces`, ask the user to pick, and pass `workspace_id` on subsequent calls.

## Step 0: Check Inflight Connection

Before anything else, verify the Inflight MCP tools are available by calling `inflight_list_workspaces`. If the call succeeds, remember the result (you'll need it in Step 1 if the widget isn't installed). Continue to Step 1.

If it fails or the tool isn't available, tell the user:

> "Inflight needs to be connected first. Run `/mcp`, select `plugin:inflight:inflight`, and authenticate in the browser. Then try again."

**Do NOT proceed with any other steps until this check passes.**

## Step 1: Widget Script Tag Check

Verify the Inflight widget script tag is in the project's root layout file. Without it, the feedback guide won't appear on the staging site.

Search for `inflight.co/widget.js` in layout/HTML files (not docs or configs). Common locations:

- **Next.js:** `app/layout.tsx`
- **Vite/CRA:** `index.html`
- **Remix:** `app/root.tsx`
- **SvelteKit:** `src/app.html`

**If found:** Continue to Step 2.

**If NOT found:** The widget needs to be added.

1. Use the workspace data from Step 0 (don't call `inflight_list_workspaces` again). Each workspace has a `widget_id` and indicates which is the user's default (`is_default: true`).
   - If only one workspace → use it automatically
   - If one is marked `is_default: true` → use it automatically
   - If multiple and no default → ask: "Which workspace is this project for?"
   - The chosen workspace will be used for the rest of the flow.
2. Insert this script tag into the root layout file, just before `</body>` (or as the last child of `<body>` in JSX/TSX):

```html
<script src="https://www.inflight.co/widget.js" data-workspace="<widget_id>" async></script>
```

3. Commit and push the change immediately so it's included in the next deployment.

Remember the `workspace_id` you resolved here — pass it to subsequent tool calls so the user isn't asked again.

## Step 2: Deployment Provider Detection

Check what deployment provider the project uses:

```bash
ls -la .vercel/project.json .netlify/state.json 2>/dev/null
```

- If `.vercel/project.json` exists → Vercel
- If `.netlify/state.json` exists → Netlify
- If both → ask user which to use
- If neither → these files may be missing in git worktrees (e.g., Conductor). Check `package.json` or config files for Vercel/Netlify references. If still nothing, ask user which provider they use or to paste their staging/preview URL manually.

**If the user pastes a URL manually**, validate it's a hosted URL (not localhost — localhost isn't accessible to reviewers). Skip Steps 3, 4, 5, 7, and 8 — you can't verify the URL matches local code. Pass no git info, no feedback guide, and use "Untitled" for the version title. Jump to Step 6 (Project Resolution).

## Step 3: Provider CLI Setup

Ensure the provider CLI is installed and authenticated. Check if the CLI is available and if the user is logged in.

- **Vercel:** check with `vercel whoami`. Install with `npm install -g vercel`, login with `vercel login`.
- **Netlify:** check with `netlify status`. Install with `npm install -g netlify-cli`, login with `netlify login`.

## Step 4: Git State Check (MANDATORY — do not skip)

**You MUST check the git state before resolving the staging URL.** The deployment won't include uncommitted or unpushed changes. Run `git status` and check:

Check for issues in this priority order. **Handle only the FIRST issue found** — fix it, then re-check. Do NOT list multiple issues at once.

1. **Detached HEAD** → "You're in detached HEAD state. Check out a branch first."
2. **Uncommitted changes** → "You have uncommitted changes. Want me to commit and push them?"
3. **No remote (branch never pushed)** → "This branch hasn't been pushed yet. Want me to push it?"
4. **Unpushed commits** → "You have unpushed commits. Want me to push them?"
5. **Clean and up to date** → continue to Step 5.

After fixing an issue, re-run `git status` to check for the next one. Keep it simple — one question, one action.

**Do NOT proceed to Step 5 until git state is clean or the user explicitly chose to continue.**

## Step 5: Resolve Staging URL

Get the current commit SHA first — this is how we'll match the deployment.

**For Vercel:**

Try to find the deployment matching the current commit:

```bash
vercel ls --format json 2>/dev/null
```

Parse the JSON output. Find the deployment matching your commit SHA. **Always use the commit-level deployment URL** (e.g., `inflight-abc123-team.vercel.app`), never a branch alias (e.g., `inflight-git-feat-x-team.vercel.app`). Branch aliases can shift to a different commit — commit URLs are stable.

If the matching deployment status is "READY", use that URL.

If no READY deployment matches the current commit:

- **Build failed/errored** → "Your Vercel build failed. Fix the build error and push again — I'll pick up where we left off." Stop here.
- **Still building** → "Found your Vercel deployment — it's still building. I'll keep checking until it's ready." Retry every 15 seconds, up to 2 minutes.
- **No deployment at all** → "No Vercel deployment found for this commit. Check your Vercel project is linked and push again."

**Never suggest pasting a URL as a fallback in this step.** The user already chose a provider in Step 2. Stay on that path.

**For Netlify:**

Get the deploy preview URL for the current branch:

```bash
netlify status --json 2>/dev/null
```

Parse the JSON for the site URL. Netlify deploy previews follow the pattern `deploy-preview-<PR#>--<site-name>.netlify.app` or `<branch>--<site-name>.netlify.app`.

If `netlify status` doesn't give a deploy preview URL, try:

```bash
netlify deploys --json 2>/dev/null | head -50
```

Find the deploy matching the current commit SHA. If no match, show the user the list with statuses and ask them to pick or paste manually.

Same retry logic applies: if just pushed and still building, wait and retry up to 2 minutes.

## Step 6: Project Resolution

**MANDATORY: You MUST present options and wait for the user to choose. Do NOT auto-select a project based on branch name or any other heuristic. Do NOT skip this step.**

Call `inflight_list_recent_projects` with `limit: 5`. Present the projects to the user as a numbered list with their latest version title and branch. Highlight any that match the current git branch. Include "Show more projects" and "Create new project" as options. If the user picks "Show more", call again with `limit: 10` and re-present. Ask the user to pick.

**Wait for the user's response before proceeding. Do NOT assume which project the user wants.**

If the user picks an existing project whose latest version has **0 comments** (no feedback yet), you MUST ask: "This version has no feedback yet. Would you like to:"

1. Update its staging URL (keeps the same version)
2. Create a new version

**Wait for the user's response. Do NOT auto-select "update" or "new version" — this is the user's decision.**

- If user picks update → use `override_version_id` (the version ID from the project's latest version)
- If user picks new version → normal flow (no `override_version_id`)

## Step 7: Generate Feedback Guide

This is the most important step. Read the diff to understand what changed visually.

- **Feature branch:** diff between the current branch and the default branch (`git diff main...HEAD` or `git diff master...HEAD`).
- **On main/default branch:** diff the last few commits (`git diff HEAD~5..HEAD`) or look at recent commit messages to understand what changed.
- **No meaningful UI changes in diff:** skip the feedback guide (pass empty array). Backend-only changes don't need design review questions.

Focus on UI-relevant files (components, styles, layouts, pages). If the diff is too large, start with the changed file list and then read the most relevant files.

Generate a focused feedback guide — **3-5 items** tailored to the actual visual changes.

### Feedback Guide Rules:

1. **Read the diff carefully.** Understand what UI elements changed, what was added, removed, or restyled.
2. **Be specific.** Reference actual components, pages, or elements by name. "How does the new checkout button feel?" not "How does the UI feel?"
3. **Mix types strategically:**
   - Use **vibe_check** (max 1) for overall feel/quality of the main change
   - Use **poll** when there's a design decision with clear alternatives (button styles, layout options)
   - Use **question** for specific areas that need attention ("Any issues with the modal on mobile?")
   - Use **ship_it** at the end if this is close to ready for merge
4. **Keep text under 120 characters.** Direct, clear, no fluff.
5. **Order intentionally.** Lead with the most important question. Vibe check or the key question first, specific details in the middle, ship_it or catch-all at the end.
6. **Don't generate generic questions.** Every question should be impossible to ask without having read the diff. If you find yourself writing "How does the overall design look?", you haven't read the diff closely enough.

### Example (good):

For a diff that changes checkout button styling and adds a loading state:

```json
[
	{ "type": "vibe_check", "text": "How does the updated checkout flow feel?" },
	{ "type": "question", "text": "Does the new loading spinner give enough feedback after clicking Submit?" },
	{
		"type": "poll",
		"text": "Which button style works better?",
		"options": [{ "text": "Current rounded style" }, { "text": "Previous square style" }]
	},
	{ "type": "question", "text": "Check the form on mobile — any spacing or tap target issues?" },
	{ "type": "ship_it", "text": "Ready to ship?" }
]
```

### Example (bad — too generic):

```json
[
	{ "type": "vibe_check", "text": "How does the design look?" },
	{ "type": "question", "text": "Any feedback?" },
	{ "type": "question", "text": "Does everything work correctly?" }
]
```

Don't present the guide for approval — just generate the best one you can. The user can edit questions directly on the staging site via the Inflight widget after the version is created.

## Step 8: Generate Project Name and Version Title

Generate both a **project name** and a **version title**. They serve different purposes:

- **Project name** = the broader feature or area of work. Think of it as a folder name. Examples: "Checkout Redesign", "Settings Page", "Mobile Navigation"
- **Version title** = the specific change in this version. Think of it as a commit message for design. Examples: "Button redesign with loading state", "Form validation and error messages", "Sidebar collapse animation"

The version title should be more specific than the project name. If adding to an existing project, you don't need a project name — just the version title.

Don't use generic names like "UI updates" or "Various changes" for either.

## Step 9: Create Version

Call `inflight_create_version` with everything gathered:

- `staging_url` from Step 5
- `version_title` from Step 8
- `project_name` from Step 8
- `project_id` from Step 6 (if adding to existing project)
- `override_version_id` if updating an existing version
- `branch`, `commit_sha`, `commit_message`, `remote_url` from git
- `feedback_guide` from Step 7

## Step 10: Done

Open the staging URL returned by the tool (it includes an auth token):

```bash
open <staging_url from tool response>
```

Done!

---

If you encounter errors at any step, see [troubleshooting.md](troubleshooting.md) for common issues and fixes. Try to resolve errors automatically before asking the user.
