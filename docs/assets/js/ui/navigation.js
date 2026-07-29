(function registerNavigationUi(root) {
  "use strict";

  const VIEW_NAMES = Object.freeze(["triage", "insights", "groups"]);

  function parseViewHash(hash) {
    const route = String(hash || "")
      .replace(/^#/, "")
      .split("?", 1)[0]
      .trim()
      .toLowerCase();
    return VIEW_NAMES.includes(route) ? route : "triage";
  }

  function createNavigationUi(context) {
    const {
      state,
      els,
      window,
    } = context;
    const tabs = Object.freeze({
      triage: els.triageTab,
      insights: els.insightsTab,
      groups: els.groupsTab,
    });
    const panels = Object.freeze({
      triage: els.triageView,
      insights: els.insightsView,
      groups: els.groupsView,
    });

    function renderNavigation() {
      for (const view of VIEW_NAMES) {
        const isActive = state.activeView === view;
        tabs[view].classList.toggle("is-active", isActive);
        tabs[view].setAttribute("aria-selected", String(isActive));
        tabs[view].tabIndex = isActive ? 0 : -1;
        panels[view].hidden = !isActive;
      }
    }

    function syncNavigationFromHash() {
      state.activeView = parseViewHash(window.location.hash);
      renderNavigation();
      context.renderActiveView();
    }

    function handleTabKeydown(event) {
      const currentTab = event.target.closest("[data-view]");
      if (!currentTab) return;

      const currentIndex = VIEW_NAMES.indexOf(currentTab.dataset.view);
      let nextIndex = currentIndex;
      if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % VIEW_NAMES.length;
      else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + VIEW_NAMES.length) % VIEW_NAMES.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = VIEW_NAMES.length - 1;
      else return;

      event.preventDefault();
      const nextView = VIEW_NAMES[nextIndex];
      tabs[nextView].focus();
      const nextHash = `#${nextView}`;
      if (window.location.hash === nextHash) {
        syncNavigationFromHash();
      } else {
        window.location.hash = nextHash;
      }
    }

    function initializeNavigation() {
      els.viewTabs.addEventListener("keydown", handleTabKeydown);
      window.addEventListener("hashchange", syncNavigationFromHash);
      syncNavigationFromHash();
    }

    return Object.freeze({
      initializeNavigation,
      renderNavigation,
      syncNavigationFromHash,
      handleTabKeydown,
    });
  }

  const app = root.WatchLaterApp ||= {};
  app.ui ||= {};
  app.ui.navigation = Object.freeze({
    VIEW_NAMES,
    parseViewHash,
    createNavigationUi,
  });
})(globalThis);
