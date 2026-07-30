(function bootstrapWatchLaterApp(root) {
  "use strict";

  const app = root.WatchLaterApp;
  const persistence = app.storage.createStorage();
  const state = app.state.createInitialState(persistence);
  const els = app.ui.dom.createDomRegistry(root.document);
  const controller = app.triageController.createTriageController({
    config: app.config,
    decisions: app.domain.decisions,
    watchLaterImport: app.domain.watchLaterImport,
    importComparison: app.domain.importComparison,
    importHistory: app.domain.importHistory,
    filters: app.domain.filters,
    insights: app.domain.insights,
    timeBudget: app.domain.timeBudget,
    grouping: app.domain.grouping,
    workspace: app.domain.workspace,
    persistence,
    browserIo: app.browserIo,
    state,
    els,
    createTriageViewUi: app.ui.triageView.createTriageViewUi,
    createDialogsUi: app.ui.dialogs.createDialogsUi,
    createVideoListUi: app.ui.videoList.createVideoListUi,
    createDashboardsUi: app.ui.dashboards.createDashboardsUi,
    createActionMenusUi: app.ui.actionMenus.createActionMenusUi,
    createResponsiveDrawerController: app.ui.accessibility.createResponsiveDrawerController,
    createInsightsViewUi: app.ui.insightsView.createInsightsViewUi,
    createGroupsViewUi: app.ui.groupsView.createGroupsViewUi,
    createNavigationUi: app.ui.navigation.createNavigationUi,
    getKeyboardShortcutAction: app.ui.triageView.getKeyboardShortcutAction,
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
