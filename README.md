# YouTube Watch Later Toolbox

Small local tools for exporting and triaging a large YouTube Watch Later playlist.

## Watch Later Triage

Open `index.html` in a browser, or publish this repository with GitHub Pages and open the page there.

The triage page:

- imports a Watch Later JSON export;
- searches and filters videos locally;
- suggests tags from hardcoded keyword rules;
- stores decisions in browser `localStorage`;
- exports and imports decision-only JSON for manual sync between devices;
- exports `keep/maybe`, delete candidates, and tagged reports.

The userscript can safely execute an imported cleanup plan on the Watch Later page. It loads the full playlist, exports a mandatory pre-delete backup and execution plan, requires a typed `DELETE <count>` confirmation, and removes videos from bottom to top through YouTube's explicitly matched menu action. Delete runs support pause, resume after refresh, stop, configurable delays, automatic periodic pauses, and JSON execution reports. A report with failures can be imported again to retry only those items.

No backend, npm install, database, or API service is required.

## Privacy

Do not commit personal Watch Later exports. They are ignored by `.gitignore`:

- `watchlater_export*.json`
- `watchlater_export*.csv`
- `watchlater_keep_maybe*.json`
- `watchlater_delete_candidates*.json`
- `watchlater_tagged_all*.json`
- `watchlater_decisions*.json`
- `watchlater_dry_run_report*.json`
- `watchlater_pre_delete_backup*.json`
- `watchlater_execution_plan*.json`
- `watchlater_execution_report*.json`
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
