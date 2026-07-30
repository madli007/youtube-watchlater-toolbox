(function registerNavigationUi(root) {
  "use strict";

  const VIEW_NAMES = Object.freeze(["triage", "insights", "groups"]);

  function decodeHashValue(value) {
    try {
      return decodeURIComponent(String(value || "").replace(/\+/g, " "));
    } catch {
      return "";
    }
  }

  function parseHashParams(hash) {
    const query = String(hash || "").split("?").slice(1).join("?");
    const params = {};
    if (!query) return params;
    for (const entry of query.split("&")) {
      if (!entry) continue;
      const [rawKey, ...rawValue] = entry.split("=");
      const key = decodeHashValue(rawKey);
      if (!key) continue;
      params[key] = decodeHashValue(rawValue.join("="));
    }
    return params;
  }

  function parseViewHash(hash) {
    const route = String(hash || "")
      .replace(/^#/, "")
      .split("?", 1)[0]
      .trim()
      .toLowerCase();
    return VIEW_NAMES.includes(route) ? route : "triage";
  }

  function parseNavigationHash(hash) {
    const view = parseViewHash(hash);
    const params = parseHashParams(hash);
    return {
      view,
      hasQuery: String(hash || "").includes("?"),
      channelKey: view === "insights" ? String(params.channel || "") : "",
      groups: view === "groups" ? {
        groupId: String(params.group || ""),
        videoId: String(params.video || ""),
      } : null,
      triage: view === "triage" ? {
        channelName: String(params.channels || ""),
        ageBucket: String(params.ageBucket || ""),
        status: Object.hasOwn(params, "status") ? params.status : undefined,
      } : null,
    };
  }

  function buildHash(view, params = {}) {
    const entries = Object.entries(params)
      .filter(([, value]) => value !== "" && value !== null && value !== undefined)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    return `#${view}${entries.length ? `?${entries.join("&")}` : ""}`;
  }

  function buildInsightsHash(channelKey = "") {
    return buildHash("insights", { channel: String(channelKey || "") });
  }

  function buildTriageHash(options = {}) {
    return buildHash("triage", {
      channels: String(options.channelName || ""),
      ageBucket: String(options.ageBucket || ""),
      status: options.status && options.status !== "all" ? options.status : "",
    });
  }

  function buildGroupsHash(options = {}) {
    return buildHash("groups", {
      group: String(options.groupId || ""),
      video: String(options.videoId || ""),
    });
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
      const route = parseNavigationHash(window.location.hash);
      state.activeView = route.view;
      if (route.view === "insights") {
        state.selectedChannelKey = route.channelKey;
      } else if (route.view === "groups" && route.groups) {
        state.selectedGroupId = route.groups.groupId;
        state.groupFocusVideoId = route.groups.videoId;
      } else if (route.view === "triage" && route.hasQuery && route.triage) {
        const model = context.getInsightsModel();
        const filters = context.buildInsightsTriageFilters(
          context.captureFilterState(),
          {
            ...route.triage,
            channels: model.channels,
            ageAnchorAt: getImportAgeAnchor(),
          },
        );
        context.applyFilterState(filters, { render: false });
      }
      renderNavigation();
      context.renderActiveView();
    }

    function navigateToHash(hash) {
      if (window.location.hash === hash) {
        syncNavigationFromHash();
      } else {
        window.location.hash = hash;
      }
    }

    function navigateToInsightsChannel(channelKey) {
      navigateToHash(buildInsightsHash(channelKey));
    }

    function navigateToGroupsGroup(groupId) {
      navigateToHash(buildGroupsHash({ groupId }));
    }

    function navigateToGroupsVideo(videoId) {
      navigateToHash(buildGroupsHash({ videoId }));
    }

    function getImportAgeAnchor() {
      return state.lastImport?.sourceExportedAt
        || state.lastImport?.ageAnchorAt
        || state.lastImport?.importedAt
        || "";
    }

    function navigateToTriageFromInsights(options = {}) {
      if (Array.isArray(options.videoIds)) {
        const availableIds = new Set(
          state.videos.map(video => video.videoId),
        );
        const videoIds = Array.from(new Set(options.videoIds))
          .filter(videoId => availableIds.has(videoId));
        context.applyFilterState({}, { render: false });
        state.selectedIds = new Set(videoIds);
        state.currentId = videoIds[0] || "";
        navigateToHash(buildTriageHash());
        return;
      }
      const model = context.getInsightsModel();
      const filters = context.buildInsightsTriageFilters(
        context.captureFilterState(),
        {
          ...options,
          channels: model.channels,
          ageAnchorAt: getImportAgeAnchor(),
        },
      );
      const channelName = filters.channels[0] || "";
      navigateToHash(buildTriageHash({
        channelName,
        ageBucket: filters.ageBucket,
        status: filters.status,
      }));
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
      navigateToInsightsChannel,
      navigateToGroupsGroup,
      navigateToGroupsVideo,
      navigateToTriageFromInsights,
    });
  }

  const app = root.WatchLaterApp ||= {};
  app.ui ||= {};
  app.ui.navigation = Object.freeze({
    VIEW_NAMES,
    parseHashParams,
    parseViewHash,
    parseNavigationHash,
    buildInsightsHash,
    buildTriageHash,
    buildGroupsHash,
    createNavigationUi,
  });
})(globalThis);
