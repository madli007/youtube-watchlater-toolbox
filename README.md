# YouTube Watch Later Toolbox

Small local tools for exporting and triaging a large YouTube Watch Later playlist.

## Watch Later Triage

Open `index.html` in a browser, or publish this repository with GitHub Pages and open the page there.

The triage page:

- imports a Watch Later JSON export;
- compares each import with the previous local dataset and shows new, removed, already-decided, metadata-changed, and orphaned items;
- provides an Inbox view containing only new videos that are still unreviewed;
- searches and filters videos locally by status, multiple channels, duration, approximate upload age, views, availability, YouTube badges, suggested tags, notes, and multiple tags with AND/OR logic;
- saves, reapplies, replaces, and deletes named filter views, which are also included in workspace snapshots;
- suggests tags from built-in and user-editable keyword rules with positive keywords, negative keywords, and optional channel scope;
- stores channel-level defaults for keep/review status and manual tags, previews their impact before applying, and warns when bulk delete touches a protected channel;
- keeps suggested tags visually separate from manual tags and lets each video store editable manual tags and a note;
- calculates total watch time and time by status, channel, and tag; shows post-cleanup time, review progress, and weeks remaining for a saved weekly budget;
- suggests a status-prioritized, shortest-first weekly shortlist from the currently visible non-delete videos and can select it for export or bulk actions;
- stores decisions in browser `localStorage`;
- exports and imports decision-only JSON for manual sync between devices;
- exports and imports a full workspace snapshot with the current video dataset, decisions, filters, rules, saved views, last-import metadata, and local change history;
- creates local safety snapshots before bulk decision changes, decision imports, workspace replacement, or clearing, with undo and restore controls;
- exports `keep/maybe`, delete candidates, and tagged reports.

The userscript can safely execute an imported cleanup plan on the Watch Later page. It loads the full playlist, exports a mandatory pre-delete backup and execution plan, requires a typed `DELETE <count>` confirmation, and removes videos from bottom to top through YouTube's explicitly matched menu action. Delete runs support pause, resume after refresh, stop, configurable delays, automatic periodic pauses, and JSON execution reports.

After a run completes or stops, the userscript reloads the playlist and exports `watchlater_reconciliation_YYYY-MM-DD.json`. The report distinguishes confirmed removals from candidates that are still present, and verifies that protected videos captured by the plan are still present. Reconciliation can also be repeated manually with `Reconcile saved run`. Importing a reconciliation report previews only its remaining candidates so they can be retried safely.

No backend, npm install, database, or API service is required.

## Privacy

Do not commit personal Watch Later exports. They are ignored by `.gitignore`:

- `watchlater_export*.json`
- `watchlater_export*.csv`
- `watchlater_keep_maybe*.json`
- `watchlater_delete_candidates*.json`
- `watchlater_tagged_all*.json`
- `watchlater_decisions*.json`
- `watchlater_workspace*.json`
- `watchlater_dry_run_report*.json`
- `watchlater_pre_delete_backup*.json`
- `watchlater_execution_plan*.json`
- `watchlater_execution_report*.json`
- `watchlater_reconciliation*.json`
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
