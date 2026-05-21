---
name: share
description: Share work for design review on Inflight. Use when the user wants to share work, get feedback, publish for review, or send work to their team. Triggers on 'share this', 'get feedback on this', 'publish for review', 'send to team', 'share to inflight', 'share my work'.
allowed-tools: Bash(git *) Bash(vercel *) Bash(netlify *) Bash(npm install *) Bash(open *) Bash(ls *) Bash(grep *) Bash(curl *)
---

# Inflight: Share Work for Review

You are helping someone share their work for design review via Inflight. Communicate in plain language — the user may not be technical. Keep messages short, friendly, and confident — don't present options when there's a clear next action. **Never reference step numbers** — describe what you're doing, not which step you're on. Execute steps sequentially — do NOT skip, reorder, or combine steps unless the step itself says to skip. Complete each step fully before moving to the next. **Only present ONE issue or question to the user at a time.** If a step requires user input or action, stop and wait — do not continue to the next step or mention issues from later steps.

**Note:** Workspace resolution is automatic — the tools use the user's saved default. If any tool returns a "workspace_selection_required" error, call `inflight_get_workspaces`, ask the user to pick, then call `inflight_set_default_workspace` with their choice. All subsequent tools will use it automatically.

## Step 0: Check Inflight Connection

Before anything else, verify the Inflight MCP tools are available by calling `inflight_get_workspaces`. If the call succeeds, remember the result (you'll need it in Step 1 if the widget isn't installed). Continue to Step 1.

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

1. Use the workspace data from Step 0 (don't call `inflight_get_workspaces` again). Each workspace has a `widget_id` and indicates which is the user's default (`is_default: true`).
   - If only one workspace → use it automatically
   - If one is marked `is_default: true` → use it automatically
   - If multiple and no default → ask: "Which workspace is this project for?" Then call `inflight_set_default_workspace` with their choice.
2. Insert this script tag into the root layout file, just before `</body>` (or as the last child of `<body>` in JSX/TSX):

```html
<script src="https://www.inflight.co/widget.js" data-workspace="<widget_id>" async></script>
```

3. Commit and push the change immediately so it's included in the next deployment.

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
- **No deployment at all** → "No Vercel deployment found for this commit. You can paste a staging URL if you have one, or check your Vercel project is linked and push again."

**Only suggest pasting a URL for the "no deployment at all" case.** For build failures and building states, stay on the provider path.

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

Find the deploy matching the current commit SHA. If no match:

- **Build failed/errored** → "Your Netlify build failed. Fix the build error and push again — I'll pick up where we left off." Stop here.
- **Still building** → "Found your Netlify deployment — it's still building. I'll keep checking until it's ready." Retry every 15 seconds, up to 2 minutes.
- **No deployment at all** → "No Netlify deployment found for this commit. You can paste a staging URL if you have one, or check your Netlify site is linked and push again."

**Only suggest pasting a URL for the "no deployment at all" case.** For build failures and building states, stay on the provider path.

## Step 6: Project Resolution

Call `inflight_list_recent_projects` with `limit: 10`. Use the results plus the current git state (branch, recent commits from Step 4) to decide where this version belongs. **Do not ask the user — decide and inform.**

### How to decide

Each project in the response includes its latest version's `branch`, `commit_sha`, and `commit_message`. Compare these against the current git branch and recent commit history.

- **Clear match** — the current branch matches a project's latest version branch AND the commits are a continuation of the same work (e.g., the stored `commit_sha` appears in your branch's history, or the `commit_message` topics are clearly related). → **Add a new version to that project.**
- **Branch matches but work is unrelated** — the branch name matches but the commits/messages are about something completely different (branch name was reused). → **Create a new project.**
- **No branch match** — no project's latest version shares the current branch. → **Create a new project.**
- **On main/master** — many projects may have `branch: "main"`. Don't try to match. → **Create a new project.**

### The "just shared" exception

If you find a matching project whose latest version was created **less than 1 hour ago**, has **0 comments**, and is clearly the same work — the user may have just shared and then pushed a fix. Ask once:

> "You shared *[version title]* [X minutes] ago. Want to update that version or create a new one?"

- Update → use `override_version_id` (the version's `id`)
- New → normal flow

This is the **only** prompt in this step. In all other cases, just decide and tell the user what you're doing:

- "Adding a new version to *[project name]*."
- "Creating a new project for this."

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
- `starting_route` — if the main UI change is on a specific route (e.g., `/checkout`, `/settings/profile`), pass it so reviewers land on the right page. Pass null if the root path is correct.
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
