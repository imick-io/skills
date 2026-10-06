# Preview

Where `verify-epic` finds the running app for a pull request. Keep exactly one **Source**.

**Source:** github-deployments

- `github-deployments`: the host reports each preview to GitHub as a deployment (Vercel does). The newest successful one for the PR's head commit is used.
- `url-pattern`: previews live at a predictable address (Coolify, self-hosted). Set **Pattern** below; `{number}` is the PR number.
- `local`: there are no previews; `verify-epic` starts the app from the PR's head, the way the project runs locally.

**Pattern:** `https://pr-{number}.preview.example.com`

**Protection:** none

When previews are protected, name the environment variables holding the credentials here (for example `PREVIEW_USER` and `PREVIEW_PASSWORD`, or Vercel's `VERCEL_AUTOMATION_BYPASS_SECRET`), and put their values in `.sandcastle/.env`. Never write the values in this file.
