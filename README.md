# YouTube Watch Later Toolbox

Small local tools for exporting and triaging a large YouTube Watch Later playlist.

## Watch Later Triage

Open `index.html` in a browser, or publish this repository with GitHub Pages and open the page there.

The triage page:

- imports a Watch Later JSON export;
- searches and filters videos locally;
- suggests tags from hardcoded keyword rules;
- stores decisions in browser `localStorage`;
- exports `keep/maybe`, delete candidates, and tagged reports.

No backend, npm install, database, or API service is required.

## Privacy

Do not commit personal Watch Later exports. They are ignored by `.gitignore`:

- `watchlater_export*.json`
- `watchlater_export*.csv`
- `watchlater_keep_maybe*.json`
- `watchlater_delete_candidates*.json`
- `watchlater_tagged_all*.json`
- `watchlater_dry_run_report*.json`
- `delete-urls*.txt`

The public `index.html` file does not contain exported video data. It does contain generic and project-specific tag keywords.

## GitHub Pages

Because `index.html` is at the repository root, GitHub Pages can serve it directly.

In GitHub:

1. Open repository settings.
2. Go to `Pages`.
3. Choose the branch.
4. Choose `/ root` as the source folder.
5. Save.
