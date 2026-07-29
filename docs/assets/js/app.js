(function bootstrapWatchLaterApp(root) {
  "use strict";

  const app = root.WatchLaterApp;
  const persistence = app.storage.createStorage();
  const state = app.state.createInitialState(persistence);
  const els = app.ui.dom.createDomRegistry(root.document);
  const controller = app.triageController.createTriageController({
    config: app.config,
    decisions: app.domain.decisions,
    importComparison: app.domain.importComparison,
    filters: app.domain.filters,
    timeBudget: app.domain.timeBudget,
    grouping: app.domain.grouping,
    workspace: app.domain.workspace,
    persistence,
    browserIo: app.browserIo,
    state,
    els,
    createDialogsUi: app.ui.dialogs.createDialogsUi,
    createVideoListUi: app.ui.videoList.createVideoListUi,
    createDashboardsUi: app.ui.dashboards.createDashboardsUi,
    createNavigationUi: app.ui.navigation.createNavigationUi,
    document: root.document,
    window: root,
    crypto: root.crypto,
  });

  if (root.__WATCHLATER_TEST__) {
    root.WatchLaterTestApi = controller.testApi;
  } else {
    controller.init();
  }
})(globalThis);
