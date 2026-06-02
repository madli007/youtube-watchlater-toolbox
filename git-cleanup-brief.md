# Git Cleanup Brief

## Goal

Before publishing GitHub Pages or making the repository public, remove personal Watch Later export JSON/CSV/report files from git tracking and, if needed, from git history.

## Project Path

```text
C:\Matej\Development\youtube-watchlater-toolbox
```

## Context

The repo contains:

- `index.html`: local Watch Later triage app;
- `youtube-watchlater-toolbox.user.js`: Tampermonkey userscript;
- planning/spec markdown files.

Personal export files may exist locally:

- `watchlater_export*.json`
- `watchlater_export*.csv`
- `watchlater_keep_maybe*.json`
- `watchlater_delete_candidates*.json`
- `watchlater_tagged_all*.json`
- `watchlater_dry_run_report*.json`
- `delete-urls*.txt`

`.gitignore` already contains ignore rules for these files, but some may already be committed.

Do not delete local JSON files from disk unless explicitly asked. Prefer `git rm --cached`.

## First Commands

Run:

```powershell
git --version
git status --short
git remote -v
git log --oneline --decorate --all --max-count=30
git ls-files
git ls-files "watchlater*.json" "watchlater*.csv" "delete-urls*.txt"
```

## If Personal Files Are Tracked

Remove them from git tracking without deleting local files:

```powershell
git rm --cached -- "watchlater_export*.json"
git rm --cached -- "watchlater_export*.csv"
git rm --cached -- "watchlater_keep_maybe*.json"
git rm --cached -- "watchlater_delete_candidates*.json"
git rm --cached -- "watchlater_tagged_all*.json"
git rm --cached -- "watchlater_dry_run_report*.json"
git rm --cached -- "delete-urls*.txt"
```

Then stage safe files:

```powershell
git add .gitignore README.md index.html youtube-watchlater-toolbox.user.js minimalna-aplikacija-plan.md potencialne-ideje.md triage-tool-spec.md trenutni-userscript-primer.js skills/SKILL.md git-cleanup-brief.md
```

Commit:

```powershell
git commit -m "Prepare Watch Later toolbox for Pages"
```

## Check History

Removing from current tracking is not enough if files are in older commits.

Check history:

```powershell
git log --all --name-only --pretty=format: -- "watchlater*.json" "watchlater*.csv" "delete-urls*.txt"
```

If this returns personal export files, history cleanup is required before publishing.

## History Cleanup With git-filter-repo

If `git filter-repo` is available:

```powershell
git filter-repo --path-glob "watchlater_export*.json" --invert-paths
git filter-repo --path-glob "watchlater_export*.csv" --invert-paths
git filter-repo --path-glob "watchlater_keep_maybe*.json" --invert-paths
git filter-repo --path-glob "watchlater_delete_candidates*.json" --invert-paths
git filter-repo --path-glob "watchlater_tagged_all*.json" --invert-paths
git filter-repo --path-glob "watchlater_dry_run_report*.json" --invert-paths
git filter-repo --path-glob "delete-urls*.txt" --invert-paths
```

Then verify:

```powershell
git log --all --name-only --pretty=format: -- "watchlater*.json" "watchlater*.csv" "delete-urls*.txt"
git status --short
```

If remote was already pushed and history was rewritten:

```powershell
git push --force --all
git push --force --tags
```

## If git-filter-repo Is Not Available

Options:

- install `git-filter-repo`;
- use BFG Repo-Cleaner;
- if the repo is still local/simple, create a fresh clean repository with only safe files.

## GitHub Pages Safety

GitHub Pages from repo root can serve committed JSON files by direct URL.

Do not enable Pages until:

- current tree is clean of personal exports;
- git history is clean, if repo will be public.

Safer Pages setup:

- publish from `/docs`;
- put only `docs/index.html` there;
- do not put JSON export files in `/docs`.

If the repo was already public with personal exports, set it private before cleanup. GitHub caches/forks may still exist after cleanup.
