# Troubleshooting

If you encounter errors at any step, try to resolve them automatically. Here are common issues:

## Git Issues
- **"Permission denied (publickey)"** on push → user needs to set up SSH keys or switch to HTTPS remote. Help them fix it.
- **"fatal: not a git repository"** → the user is not in a git repo. Ask them to navigate to their project root.
- **Merge conflicts** → help resolve them or ask the user to resolve manually before continuing.
- **"error: failed to push some refs"** → remote has changes not pulled locally. Run `git pull --rebase` first, then push.

## Vercel Issues
- **"Error: No existing credentials found"** → run `vercel login` and complete browser auth.
- **"Error: The specified scope does not exist"** → user may have multiple Vercel accounts. Run `vercel switch` to pick the right team/account.
- **`vercel ls` shows no deployments** → the project may not be linked. Run `vercel link` to connect the local project.
- **`vercel` command not found** → install with `npm install -g vercel`.
- **Deployment stuck in "Building" for >5 minutes** → suggest the user check the Vercel dashboard for build errors, or paste the URL manually once ready.

## Netlify Issues
- **"Error: You must be logged in"** → run `netlify login`.
- **`netlify` command not found** → install with `npm install -g netlify-cli`.
- **"Error: No site id found"** → the project isn't linked. Run `netlify link` or `netlify init`.
- **No deploy preview URL found** → the site may not have deploy previews enabled. Ask the user to paste the URL manually.

## Inflight Issues
- **"workspace_selection_required" error from tools** → call `inflight_list_workspaces`, ask user to pick, pass `workspace_id` explicitly.
- **Version creation fails** → check that the staging URL is valid (not localhost, has a domain). Check that the workspace has an active subscription.
- **Widget script tag not working after deploy** → make sure the commit with the script tag was pushed AND that the deployment was built from that commit.

## General
- **sudo/permission issues** → try running the command without sudo first. If npm install fails, suggest `npm install -g <package> --force` or using a node version manager.
- **Network/timeout errors** → retry once. If persistent, may be a firewall or VPN issue.
- **Any unrecognized error** → read the error message carefully, explain it to the user in plain language, and suggest a fix. Don't just say "an error occurred."
