# Cloud Configs

A static, GitHub-Pages-hosted browser/uploader for shared configs. No backend,
the page talks directly to the GitHub REST API. Listing/downloading works for
anyone; uploading requires a visitor to paste their own GitHub token (nothing
is sent anywhere except straight to GitHub).

## Setup

1. Push this folder to a **public** GitHub repo.
2. Edit `config.js` and set `GITHUB_OWNER` / `GITHUB_REPO` / `GITHUB_BRANCH` to match your repo.
3. In the repo settings, enable **Pages** → deploy from the branch you pushed (root folder).
4. Make sure a `configs/` folder exists in the repo (it's included here with a `.gitkeep`).

That's it, no build step, no server.

## How uploading works

Each config is stored as a JSON file at `configs/<slug>.json` shaped like:

```json
{
  "name": "rage aimbot",
  "description": "silent aim preset",
  "author": "oxyhax",
  "uploadedAt": "2026-09-18T00:00:00.000Z",
  "config": { /* the actual exported config data */ }
}
```

To upload, a visitor needs a GitHub **fine-grained personal access token**
scoped to *only this repo* with **Contents: Read and write** permission
(create one at github.com/settings/personal-access-tokens/new). The token is
stored in their browser's `localStorage` and sent as a bearer token directly
to `api.github.com`. It never touches any third-party server.

The site uses the GitHub Contents API (`PUT /repos/:owner/:repo/contents/:path`)
to commit each upload as its own file, so every upload shows up as a normal
commit on the repo.

## Pulling configs from Roblox

Since every config's raw file is public at
`https://raw.githubusercontent.com/<owner>/<repo>/<branch>/configs/<file>.json`,
the game script can list available configs the same way this page does
(`GET https://api.github.com/repos/<owner>/<repo>/contents/configs`) and then
`game:HttpGet()` the `download_url` of whichever one the user picks, parse the
JSON, and feed the `.config` field into `Menu.Config`'s loader.

## Limitations / things to know

- Unauthenticated GitHub API requests are capped at 60/hour per IP. If a
  visitor has saved a token, their requests use their own 5,000/hour quota
  instead, but if you get real traffic, expect the *anonymous* listing to
  rate-limit occasionally. There's no caching layer here; if that becomes a
  problem later, the fix is a tiny edge cache in front of the API, not a
  redesign of the page.
- There's no moderation. Anyone with a token can upload anything. If this
  goes public, you'll want at least a way to delete/report entries. That's
  not built yet.
- Tokens are scoped by the user themselves; there's nothing stopping someone
  from using a token with broader permissions than intended. The UI tells
  them to scope it to just this repo, but can't enforce it.
