# YouTube Watch Later Toolbox

Small local tools for exporting and triaging a large YouTube Watch Later playlist.

## Watch Later Triage

Open `docs/index.html` in a browser, or publish the repository's `docs/` folder with GitHub Pages and open the page there.

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
- detects episode/series patterns, similar same-channel titles, and probable same-channel duplicate or reuploaded videos locally across the full dataset;
- supports persistent per-channel series aliases, same-channel manual group merges, member splits, and removable stale/orphaned corrections included in workspace snapshots;
- shows every member of a detected group and supports selecting or marking the whole group, plus undoable “keep newest only” and “keep most viewed only” recommendations;
- opens an in-app YouTube preview by button or the `p` shortcut without changing the current filters or list position, with a larger thumbnail, metadata, decision buttons, saved playback timestamps, and an optional playback-aware 30-second review timer;
- stores decisions in browser `localStorage`;
- exports and imports decision-only JSON for manual sync between devices;
- exports and imports a full workspace snapshot with the current video dataset, decisions, filters, rules, saved views, last-import metadata, local change history, compact import snapshots, and grouping corrections;
- creates local safety snapshots before bulk decision changes, decision imports, workspace replacement, or clearing, with undo and restore controls;
- shows Channel Insights KPIs plus a searchable, sortable channel-by-age matrix with count/watch-time measures, explicit duration coverage, global or per-channel heat scaling, and a selected-channel panel for backlog impact, decision-health proxies, age distribution, oldest untouched videos, and new arrivals;
- exports `keep/maybe`, delete candidates, and tagged reports.

The userscript can safely execute an imported cleanup plan on the Watch Later page. It loads the full playlist, exports a mandatory pre-delete backup and execution plan, requires a typed `DELETE <count>` confirmation, and removes videos from bottom to top through YouTube's explicitly matched menu action. Delete runs support pause, resume after refresh, stop, configurable delays, automatic periodic pauses, and JSON execution reports.

After a run completes or stops, the userscript reloads the playlist and exports `watchlater_reconciliation_YYYY-MM-DD.json`. The report distinguishes confirmed removals from candidates that are still present, and verifies that protected videos captured by the plan are still present. Reconciliation can also be repeated manually with `Reconcile saved run`. Importing a reconciliation report previews only its remaining candidates so they can be retried safely.

No backend, npm install, database, or API service is required.

## Project structure

The published application lives entirely under `docs/`:

```text
docs/
  index.html
  assets/
    css/app.css
    js/
      config.js
      domain/              Pure decision, filter, grouping, time, and workspace logic
      storage.js           The only direct localStorage boundary
      browser-io.js        File reading and download boundary
      state.js             Central state creation
      ui/                  DOM registry and UI factories
      triage-controller.js Application workflows and event handlers
      app.js               Dependency composition and bootstrap
```

The JavaScript uses ordered classic scripts so `docs/index.html` remains usable over `file://`. The dependency order is documented beside the script tags in that file. ES modules are intentionally not used because they would require changing the direct local-opening workflow without providing a current product benefit.

Workspace snapshots keep the outer `schemaVersion: 1`. Import history and grouping corrections are stored in the optional `workspace.extensions.channelInsights` block, so older app versions can still open the file. Re-exporting that file through an older version will discard extension data.

## Local running and tests

Open `docs/index.html` directly in a browser. To test through HTTP instead, run a static server from the repository root and open its `/docs/` path.

No dependency installation or build step is needed. Run the automated checks with:

```text
node tests/domain-modules.test.cjs
node tests/state-storage.test.cjs
node tests/triage-workspace.test.cjs
node tests/bootstrap-architecture.test.cjs
node tests/action-menus.test.cjs
node tests/navigation.test.cjs
node tests/triage-view.test.cjs
node tests/insights.test.cjs
node tests/insights-view.test.cjs
node tests/import-history.test.cjs
node tests/workspace-extension.test.cjs
node tests/grouping-parser.test.cjs
node tests/grouping-clustering.test.cjs
node tests/grouping-overrides.test.cjs
node tests/groups-view.test.cjs
node tests/userscript-reconciliation.test.cjs
```

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

The public `docs/index.html` file does not contain exported video data. It does contain generic and project-specific tag keywords.

## GitHub Pages

GitHub Pages serves the static application from the repository's `docs/` folder.

In GitHub:

1. Open repository settings.
2. Go to `Pages`.
3. Choose `Deploy from a branch`.
4. Choose the `main` branch and `/docs` as the source folder.
5. Save.
