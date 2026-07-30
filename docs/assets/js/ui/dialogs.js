(function registerDialogsUi(root) {
  "use strict";

  function createDialogsUi(context) {
    let groupingAliasSaveHandler = null;

    const {
      state,
      els,
      RULES,
      updateDecisionDetails,
      normalizeRule,
      normalizeChannelRules,
      normalizeChannelRule,
      getChannelRuleDecision,
      getChannelRuleImpact,
      getCombinedChannelRuleImpact,
      splitInputValues,
      areDecisionsEqual,
      createSnapshotId,
      filterChannelOptions,
      getChannelOptionPage,
    } = context;
    const getVideoTags = (...args) => context.getVideoTags(...args);
    const getStatus = (...args) => context.getStatus(...args);
    const getDecision = (...args) => context.getDecision(...args);
    const getFilteredVideos = (...args) => context.getFilteredVideos(...args);
    const setStatusAndAdvance = (...args) => context.setStatusAndAdvance(...args);
    const setStatus = (...args) => context.setStatus(...args);
    const moveCurrent = (...args) => context.moveCurrent(...args);
    const render = (...args) => context.render(...args);
    const showToast = (...args) => context.showToast(...args);
    const saveDecisions = (...args) => context.saveDecisions(...args);
    const savePreviewProgress = (...args) => context.savePreviewProgress(...args);
    const saveUserRules = (...args) => context.saveUserRules(...args);
    const saveChannelRules = (...args) => context.saveChannelRules(...args);
    const renderTagFilters = (...args) => context.renderTagFilters(...args);
    const getEffectiveRules = (...args) => context.getEffectiveRules(...args);
    const refreshEnrichedVideos = (...args) => context.refreshEnrichedVideos(...args);
    const getAllChannelNames = (...args) => context.getAllChannelNames(...args);
    const getAllTagNames = (...args) => context.getAllTagNames(...args);
    const groupCounts = (...args) => context.groupCounts(...args);
    const createChannelName = (...args) => context.createChannelName(...args);
    const createCount = (...args) => context.createCount(...args);
    const addHistoryEntry = (...args) => context.addHistoryEntry(...args);

    function openGroupingAliasEditor(group, onSave) {
      groupingAliasSaveHandler = typeof onSave === "function" ? onSave : null;
      els.groupingAliasContext.textContent = [
        group?.label,
        ...(group?.members || []).slice(0, 1).map(video => video.channel),
      ].filter(Boolean).join(" · ");
      els.groupingAliasInput.value = group?.label || "";
      els.groupingAliasDialog.showModal();
      els.groupingAliasInput.select();
    }

    function saveGroupingAliasEditor(event) {
      event.preventDefault();
      if (!groupingAliasSaveHandler) return;
      const saved = groupingAliasSaveHandler(els.groupingAliasInput.value);
      if (saved === false) return;
      groupingAliasSaveHandler = null;
      els.groupingAliasDialog.close();
    }

    function closeGroupingAliasEditor() {
      groupingAliasSaveHandler = null;
      els.groupingAliasDialog.close();
    }

    function buildYouTubeEmbedUrl(videoId, startSeconds = 0, locationOrigin = "") {
      const cleanId = String(videoId || "").trim();
      if (!cleanId) return "";
      const seconds = Math.max(0, Math.floor(Number(startSeconds) || 0));
      const params = ["autoplay=1", "enablejsapi=1", "playsinline=1", "rel=0"];
      if (seconds > 0) params.push(`start=${seconds}`);
      if (/^https?:\/\//i.test(locationOrigin)) params.push(`origin=${encodeURIComponent(locationOrigin)}`);
      return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(cleanId)}?${params.join("&")}`;
    }

    function formatPreviewTime(seconds) {
      const total = Math.max(0, Math.floor(Number(seconds) || 0));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const remainder = total % 60;
      return hours
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
        : `${minutes}:${String(remainder).padStart(2, "0")}`;
    }

    function openQuickPreview(videoId) {
      const video = state.videos.find(candidate => candidate.videoId === videoId);
      if (!video || video.isUnavailable) return;
      if (state.previewVideoId && state.previewVideoId !== videoId) flushPreviewProgress();
      state.previewVideoId = videoId;
      state.currentId = videoId;
      render();
      renderQuickPreview(video);
      if (!els.quickPreviewDialog.open) els.quickPreviewDialog.showModal();
      startPreviewSession();
    }

    function renderQuickPreview(video) {
      if (!video) return;
      const savedSeconds = state.previewProgress[video.videoId] || 0;
      const link = video.cleanUrl || video.url || `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`;
      els.quickPreviewTitle.textContent = video.title || "(untitled)";
      els.quickPreviewTitle.href = link;
      els.quickPreviewThumb.src = video.thumbnailUrl || "";
      els.quickPreviewThumb.alt = video.title ? `Thumbnail for ${video.title}` : "Video thumbnail";
      els.quickPreviewMeta.textContent = [video.channel, video.duration, video.views, video.uploaded].filter(Boolean).join(" · ");
      els.quickPreviewProgress.textContent = savedSeconds
        ? `Resuming from ${formatPreviewTime(savedSeconds)}. Playback position is saved locally.`
        : "Playback position will be saved locally.";

      const decision = getDecision(video.videoId);
      const chips = [];
      (video.suggestedTags || []).forEach(tag => chips.push(createPreviewTag(`Suggested: ${tag}`, "tag")));
      (decision.tags || []).forEach(tag => chips.push(createPreviewTag(`Manual: ${tag}`, "tag manual-tag")));
      els.quickPreviewTags.replaceChildren(...chips);
      Array.from(els.quickPreviewStatusActions.querySelectorAll("[data-preview-status]")).forEach(button => {
        button.classList.toggle("is-active", button.dataset.previewStatus === decision.status);
      });

      const origin = location.origin === "null" ? "" : location.origin;
      els.quickPreviewPlayer.dataset.videoId = video.videoId;
      state.previewPlayerReady = false;
      els.quickPreviewPlayer.src = buildYouTubeEmbedUrl(video.videoId, savedSeconds, origin);
      resetPreviewDecisionTimer();
    }

    function createPreviewTag(text, className) {
      const chip = document.createElement("span");
      chip.className = className;
      chip.textContent = text;
      return chip;
    }

    function startPreviewSession() {
      stopPreviewSession(false);
      state.previewCurrentTime = state.previewProgress[state.previewVideoId] || 0;
      state.previewPlayerState = -1;
      state.previewLastPersistAt = Date.now();
      state.previewPollTimer = window.setInterval(() => {
        sendPreviewCommand("getCurrentTime");
        sendPreviewCommand("getPlayerState");
        tickPreviewDecisionTimer();
      }, 500);
    }

    function stopPreviewSession(shouldFlush = true) {
      if (shouldFlush) flushPreviewProgress();
      if (state.previewPollTimer !== null) window.clearInterval(state.previewPollTimer);
      state.previewPollTimer = null;
      state.previewCountdownActive = false;
    }

    function closeQuickPreview() {
      stopPreviewSession();
      state.previewVideoId = "";
      state.previewCurrentTime = 0;
      state.previewPlayerState = -1;
      state.previewPlayerReady = false;
      els.quickPreviewPlayer.src = "about:blank";
      els.quickPreviewPlayer.dataset.videoId = "";
      resetPreviewDecisionTimer();
    }

    function openShortcutHelp() {
      if (!els.shortcutHelpDialog.open) els.shortcutHelpDialog.showModal();
      els.closeShortcutHelp.focus();
    }

    function initializePreviewPlayer() {
      if (!state.previewVideoId || els.quickPreviewPlayer.src === "about:blank") return;
      state.previewPlayerReady = true;
      els.quickPreviewPlayer.contentWindow?.postMessage(JSON.stringify({
        event: "listening",
        id: "quick-preview-player",
        channel: "quick-preview",
      }), "*");
      sendPreviewCommand("addEventListener", ["onStateChange"]);
      sendPreviewCommand("getCurrentTime");
      sendPreviewCommand("getPlayerState");
    }

    function sendPreviewCommand(func, args = []) {
      if (!state.previewVideoId) return;
      els.quickPreviewPlayer.contentWindow?.postMessage(JSON.stringify({
        event: "command",
        func,
        args,
      }), "*");
    }

    function handlePreviewPlayerMessage(event) {
      if (!state.previewVideoId || !state.previewPlayerReady || event.source !== els.quickPreviewPlayer.contentWindow) return;
      if (!/^https:\/\/(www\.)?youtube(-nocookie)?\.com$/i.test(event.origin)) return;
      let message = event.data;
      if (typeof message === "string") {
        try {
          message = JSON.parse(message);
        } catch (_error) {
          return;
        }
      }
      if (!message || typeof message !== "object") return;
      const info = message.info && typeof message.info === "object" ? message.info : {};
      if (Number.isFinite(Number(info.currentTime))) updatePreviewCurrentTime(Number(info.currentTime));
      if (Number.isFinite(Number(info.playerState))) state.previewPlayerState = Number(info.playerState);
      if (message.event === "onStateChange" && Number.isFinite(Number(message.info))) {
        state.previewPlayerState = Number(message.info);
      }
    }

    function updatePreviewCurrentTime(seconds) {
      if (!state.previewVideoId || !Number.isFinite(seconds) || seconds < 0) return;
      state.previewCurrentTime = seconds;
      state.previewProgress[state.previewVideoId] = Math.floor(seconds);
      els.quickPreviewProgress.textContent = `Current position ${formatPreviewTime(seconds)} · saved locally.`;
      if (Date.now() - state.previewLastPersistAt >= 5000) flushPreviewProgress();
    }

    function flushPreviewProgress() {
      if (state.previewVideoId && state.previewCurrentTime > 0) {
        state.previewProgress[state.previewVideoId] = Math.floor(state.previewCurrentTime);
      }
      try {
        if (!savePreviewProgress(state.previewProgress)) return false;
        state.previewLastPersistAt = Date.now();
        return true;
      } catch (_error) {
        return false;
      }
    }

    function startPreviewDecisionTimer() {
      state.previewCountdownRemaining = 30;
      state.previewCountdownActive = true;
      state.previewCountdownLastTick = performance.now();
      sendPreviewCommand("playVideo");
      updatePreviewTimerUi();
    }

    function resetPreviewDecisionTimer() {
      state.previewCountdownRemaining = 30;
      state.previewCountdownActive = false;
      state.previewCountdownLastTick = 0;
      updatePreviewTimerUi();
    }

    function tickPreviewDecisionTimer(now = performance.now()) {
      if (!state.previewCountdownActive) return;
      if (state.previewPlayerState === 1) {
        const elapsed = Math.max(0, (now - state.previewCountdownLastTick) / 1000);
        state.previewCountdownRemaining = Math.max(0, state.previewCountdownRemaining - elapsed);
      }
      state.previewCountdownLastTick = now;
      if (state.previewCountdownRemaining <= 0) {
        state.previewCountdownActive = false;
        sendPreviewCommand("pauseVideo");
        updatePreviewTimerUi();
        els.quickPreviewStatusActions.querySelector('[data-preview-status="keep"]')?.focus();
        showToast("30-second review complete. Choose Keep, Maybe, or Delete.");
        return;
      }
      updatePreviewTimerUi();
    }

    function updatePreviewTimerUi() {
      const ready = !state.previewCountdownActive && state.previewCountdownRemaining <= 0;
      els.quickPreviewTimer.classList.toggle("is-ready", ready);
      els.startPreviewTimer.textContent = state.previewCountdownActive ? "Restart 30 s review" : "Start 30 s review";
      els.quickPreviewTimerStatus.textContent = ready
        ? "Time to decide — playback is paused."
        : state.previewCountdownActive
          ? `${Math.ceil(state.previewCountdownRemaining)} s left${state.previewPlayerState === 1 ? "" : " · waiting for playback"}`
          : "Timer counts only while the video is playing.";
    }

    function setPreviewStatusAndAdvance(status) {
      const videoId = state.previewVideoId;
      if (!videoId || !["keep", "maybe", "delete", "unreviewed"].includes(status)) return;
      const before = getFilteredVideos();
      const currentIndex = before.findIndex(video => video.videoId === videoId);
      const preferredIds = before.slice(Math.max(0, currentIndex + 1)).concat(before.slice(0, Math.max(0, currentIndex)))
        .map(video => video.videoId)
        .filter(candidateId => candidateId !== videoId);
      flushPreviewProgress();
      setStatus(videoId, status);
      const after = getFilteredVideos();
      const afterIds = new Set(after.map(video => video.videoId));
      const nextId = preferredIds.find(candidateId => afterIds.has(candidateId)) || after[0]?.videoId || "";
      if (!nextId) {
        els.quickPreviewDialog.close();
        render();
        showToast(`Marked the last matching video as ${status}.`);
        return;
      }
      state.previewVideoId = nextId;
      state.currentId = nextId;
      render();
      renderQuickPreview(state.videos.find(video => video.videoId === nextId));
      startPreviewSession();
    }

    function moveQuickPreview(direction) {
      const videos = getFilteredVideos();
      const currentIndex = videos.findIndex(video => video.videoId === state.previewVideoId);
      if (currentIndex < 0) return;
      const nextIndex = Math.min(Math.max(currentIndex + direction, 0), videos.length - 1);
      const next = videos[nextIndex];
      if (!next || next.videoId === state.previewVideoId) return;
      flushPreviewProgress();
      state.previewVideoId = next.videoId;
      state.currentId = next.videoId;
      render();
      renderQuickPreview(next);
      startPreviewSession();
    }

    function openVideoEditor(videoId) {
      const video = state.videos.find(candidate => candidate.videoId === videoId);
      if (!video) return;
      const decision = getDecision(videoId);
      state.editingVideoId = videoId;
      state.currentId = videoId;
      els.videoEditorTitle.textContent = `${video.title || "(untitled)"} · ${video.channel || "Unknown channel"}`;
      els.videoTagsInput.value = (decision.tags || []).join(", ");
      els.videoNoteInput.value = decision.note || "";
      const suggested = (video.suggestedTags || []).map(tag => {
        const chip = document.createElement("span");
        chip.className = "tag";
        chip.textContent = tag;
        return chip;
      });
      if (!suggested.length) {
        const empty = document.createElement("span");
        empty.className = "scope-text";
        empty.textContent = "No tags suggested by the current rules.";
        suggested.push(empty);
      }
      els.videoEditorSuggested.replaceChildren(...suggested);
      els.videoEditorDialog.showModal();
      els.videoTagsInput.focus();
    }

    function saveVideoEditor(event) {
      event.preventDefault();
      const videoId = state.editingVideoId;
      if (!videoId) return;
      updateDecisionDetails(
        state.decisions,
        videoId,
        splitInputValues(els.videoTagsInput.value),
        els.videoNoteInput.value,
      );
      saveDecisions();
      els.videoEditorDialog.close();
      render();
      showToast("Saved manual tags and note.");
    }

    function renderRuleSummary() {
      const builtInCount = Object.keys(RULES).length;
      const userCount = Object.keys(state.userRules).length;
      els.ruleSummary.textContent = `${builtInCount} built-in rules · ${userCount} custom or overridden.`;
    }

    function openRulesDialog() {
      renderRuleChannelOptions();
      renderRuleList();
      resetRuleEditor();
      els.rulesDialog.showModal();
    }

    function renderChannelRuleSummary() {
      const protectedCount = state.channelRules.filter(rule => rule.protected).length;
      const pending = getCombinedChannelRuleImpact(state.videos, state.decisions, state.channelRules);
      els.channelRuleSummary.textContent = `${state.channelRules.length} rules · ${protectedCount} protected channels · ${pending.affectedIds.length} videos with pending defaults.`;
    }

    function renderRuleChannelOptions() {
      els.ruleChannels.replaceChildren(...getAllChannelNames().map(channel => {
        const option = document.createElement("option");
        option.value = channel;
        return option;
      }));
    }

    function renderRuleList() {
      const effectiveRules = getEffectiveRules();
      const names = Object.keys(effectiveRules).sort((a, b) => a.localeCompare(b));
      const items = names.map(name => {
        const rule = effectiveRules[name];
        const isBuiltIn = Object.prototype.hasOwnProperty.call(RULES, name);
        const isOverride = Object.prototype.hasOwnProperty.call(state.userRules, name);
        const item = document.createElement("div");
        item.className = "rule-item";
        const content = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = name;
        const meta = document.createElement("div");
        meta.className = "rule-item-meta";
        const source = isOverride ? (isBuiltIn ? "built-in override" : "custom") : "built-in";
        const channel = rule.channel ? ` · channel: ${rule.channel}` : " · all channels";
        meta.textContent = `${source} · ${rule.positive.length} positive · ${rule.negative.length} negative${channel}`;
        content.append(title, meta);
        const actions = document.createElement("div");
        actions.className = "rule-item-actions";
        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => editRule(name));
        actions.appendChild(edit);
        if (isOverride || !isBuiltIn) {
          const remove = document.createElement("button");
          remove.type = "button";
          remove.textContent = isBuiltIn ? "Restore" : "Remove";
          remove.addEventListener("click", () => removeUserRule(name, isBuiltIn));
          actions.appendChild(remove);
        }
        item.append(content, actions);
        return item;
      });
      els.ruleList.replaceChildren(...items);
    }

    function editRule(name) {
      const rule = getEffectiveRules()[name];
      if (!rule) return;
      state.editingRuleName = name;
      els.ruleNameInput.value = name;
      els.ruleNameInput.readOnly = true;
      els.rulePositiveInput.value = rule.positive.join("\n");
      els.ruleNegativeInput.value = rule.negative.join("\n");
      els.ruleChannelInput.value = rule.channel;
      els.rulePositiveInput.focus();
    }

    function resetRuleEditor() {
      state.editingRuleName = "";
      els.ruleNameInput.readOnly = false;
      els.ruleNameInput.value = "";
      els.rulePositiveInput.value = "";
      els.ruleNegativeInput.value = "";
      els.ruleChannelInput.value = "";
      if (els.rulesDialog.open) els.ruleNameInput.focus();
    }

    function saveRuleEditor(event) {
      event.preventDefault();
      const name = els.ruleNameInput.value.trim();
      const positive = splitInputValues(els.rulePositiveInput.value);
      if (!name || !positive.length) {
        showToast("A rule needs a tag name and at least one positive keyword.");
        return;
      }
      state.userRules[name] = normalizeRule({
        positive,
        negative: splitInputValues(els.ruleNegativeInput.value),
        channel: els.ruleChannelInput.value,
      });
      saveUserRules(state.userRules);
      refreshEnrichedVideos();
      state.activeTags = new Set(Array.from(state.activeTags).filter(tag => getAllTagNames().includes(tag)));
      renderRuleList();
      renderTagFilters();
      render();
      resetRuleEditor();
      showToast(`Saved rule for “${name}”.`);
    }

    function removeUserRule(name, restoresBuiltIn) {
      const action = restoresBuiltIn ? "restore the built-in rule" : "remove this custom rule";
      if (!confirm(`Remove “${name}” and ${action}?`)) return;
      delete state.userRules[name];
      saveUserRules(state.userRules);
      refreshEnrichedVideos();
      state.activeTags = new Set(Array.from(state.activeTags).filter(tag => getAllTagNames().includes(tag)));
      renderRuleList();
      renderTagFilters();
      render();
      resetRuleEditor();
      showToast(restoresBuiltIn ? `Restored built-in rule “${name}”.` : `Removed rule “${name}”.`);
    }

    function openChannelRulesDialog() {
      renderChannelRuleList();
      resetChannelRuleEditor();
      els.channelRulesDialog.showModal();
    }

    function getChannelRuleChannelOptions() {
      const channels = groupCounts(state.videos, video => video.channel || "(unknown)");
      return filterChannelOptions(channels, els.channelRuleChannelInput.value);
    }

    function openChannelRuleChannelMenu() {
      renderChannelRuleChannelMenu();
      els.channelRuleChannelCombo.classList.add("is-open");
    }

    function closeChannelRuleChannelMenu() {
      els.channelRuleChannelCombo.classList.remove("is-open");
    }

    function selectChannelRuleChannel(channel) {
      els.channelRuleChannelInput.value = channel;
      closeChannelRuleChannelMenu();
      renderChannelRulePreview();
    }

    function renderChannelRuleChannelMenu() {
      const page = getChannelOptionPage(
        groupCounts(state.videos, video => video.channel || "(unknown)"),
        els.channelRuleChannelInput.value,
        24,
      );
      const visibleMatches = page.options;
      const summary = document.createElement("div");
      summary.className = "scope-text";
      summary.textContent = page.totalCount > visibleMatches.length
        ? `Showing first ${visibleMatches.length} of ${page.totalCount} matches. Keep typing to narrow the list.`
        : `${page.totalCount} matching ${page.totalCount === 1 ? "channel" : "channels"}.`;

      const options = visibleMatches.map(item => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "channel-option";
        button.title = item.name;
        button.append(createChannelName(item.name), createCount(item.count));
        button.addEventListener("click", () => selectChannelRuleChannel(item.name));
        return button;
      });

      if (!options.length) {
        const empty = document.createElement("div");
        empty.className = "scope-text";
        empty.textContent = "No matching channels. You can still use the typed channel name.";
        els.channelRuleChannelMenu.replaceChildren(summary, empty);
        return;
      }
      els.channelRuleChannelMenu.replaceChildren(summary, ...options);
    }

    function renderChannelRuleList() {
      const items = state.channelRules.map(rule => {
        const impact = getChannelRuleImpact(state.videos, state.decisions, rule);
        const item = document.createElement("div");
        item.className = "rule-item";
        const content = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = rule.channel;
        const meta = document.createElement("div");
        meta.className = "rule-item-meta";
        const tag = rule.tag ? ` · tag: ${rule.tag}` : "";
        const protection = rule.protected ? " · protected" : "";
        meta.textContent = `${formatChannelRuleMode(rule.mode)}${tag}${protection} · ${impact.matchCount} matches · ${impact.affectedIds.length} pending`;
        content.append(title, meta);
        const actions = document.createElement("div");
        actions.className = "rule-item-actions";
        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => editChannelRule(rule.id));
        const apply = document.createElement("button");
        apply.type = "button";
        apply.textContent = "Apply";
        apply.disabled = !impact.affectedIds.length;
        apply.addEventListener("click", () => applyChannelRules([rule], `channel rule for ${rule.channel}`));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.addEventListener("click", () => removeChannelRule(rule.id));
        actions.append(edit, apply, remove);
        item.append(content, actions);
        return item;
      });

      if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "scope-text";
        empty.textContent = "No channel rules yet.";
        items.push(empty);
      }
      els.channelRuleList.replaceChildren(...items);
      els.applyAllChannelRules.disabled = !getCombinedChannelRuleImpact(state.videos, state.decisions, state.channelRules).affectedIds.length;
    }

    function getChannelRuleDraft() {
      return normalizeChannelRule({
        id: state.editingChannelRuleId,
        channel: els.channelRuleChannelInput.value,
        mode: els.channelRuleModeSelect.value,
        tag: els.channelRuleTagInput.value,
        protected: els.channelRuleProtectedInput.checked,
      });
    }

    function renderChannelRulePreview() {
      const alwaysKeep = els.channelRuleModeSelect.value === "always-keep";
      if (alwaysKeep) els.channelRuleProtectedInput.checked = true;
      els.channelRuleProtectedInput.disabled = alwaysKeep;
      const rule = getChannelRuleDraft();
      if (!rule) {
        els.channelRulePreview.textContent = "Choose a channel to preview this rule.";
        els.applyChannelRule.disabled = true;
        return;
      }
      const impact = getChannelRuleImpact(state.videos, state.decisions, rule);
      const protection = rule.protected
        ? ` ${impact.matchCount} matching videos will trigger protected-channel delete warnings.`
        : "";
      els.channelRulePreview.textContent = `${impact.matchCount} matching videos. Applying now would change ${impact.statusChangeCount} statuses and add ${impact.tagAdditionCount} tags across ${impact.affectedIds.length} videos.${protection}`;
      els.applyChannelRule.disabled = !impact.affectedIds.length;
    }

    function editChannelRule(ruleId) {
      const rule = state.channelRules.find(candidate => candidate.id === ruleId);
      if (!rule) return;
      state.editingChannelRuleId = rule.id;
      els.channelRuleChannelInput.value = rule.channel;
      els.channelRuleModeSelect.value = rule.mode;
      els.channelRuleTagInput.value = rule.tag;
      els.channelRuleProtectedInput.checked = rule.protected;
      renderChannelRulePreview();
      els.channelRuleChannelInput.focus();
    }

    function resetChannelRuleEditor() {
      state.editingChannelRuleId = "";
      els.channelRuleChannelInput.value = "";
      els.channelRuleModeSelect.value = "none";
      els.channelRuleTagInput.value = "";
      els.channelRuleProtectedInput.checked = false;
      renderChannelRulePreview();
      if (els.channelRulesDialog.open) els.channelRuleChannelInput.focus();
    }

    function saveChannelRuleEditor(event) {
      event.preventDefault();
      const rule = getChannelRuleDraft();
      if (!rule) {
        showToast("A channel rule needs a channel name.");
        return;
      }
      const savedRule = storeChannelRule(rule);
      renderChannelRuleList();
      renderChannelRuleSummary();
      renderChannelRulePreview();
      showToast(`Saved channel rule for “${savedRule.channel}”. Review the preview before applying it.`);
    }

    function storeChannelRule(rule) {
      const existingIndex = state.channelRules.findIndex(candidate =>
        candidate.id === rule.id || candidate.channel.toLowerCase() === rule.channel.toLowerCase()
      );
      if (existingIndex >= 0) {
        rule.id = state.channelRules[existingIndex].id;
        state.channelRules.splice(existingIndex, 1, rule);
      } else {
        rule.id = createSnapshotId();
        state.channelRules.push(rule);
      }
      state.channelRules = normalizeChannelRules(state.channelRules);
      state.editingChannelRuleId = rule.id;
      saveChannelRules(state.channelRules);
      return state.channelRules.find(candidate => candidate.id === rule.id) || rule;
    }

    function removeChannelRule(ruleId) {
      const rule = state.channelRules.find(candidate => candidate.id === ruleId);
      if (!rule || !confirm(`Remove the channel rule for “${rule.channel}”? Applied decisions will not be changed.`)) return;
      state.channelRules = state.channelRules.filter(candidate => candidate.id !== ruleId);
      saveChannelRules(state.channelRules);
      renderChannelRuleList();
      renderChannelRuleSummary();
      resetChannelRuleEditor();
      showToast(`Removed channel rule for “${rule.channel}”.`);
    }

    function applyCurrentChannelRule() {
      const rule = getChannelRuleDraft();
      if (!rule) {
        showToast("Choose a channel before applying a rule.");
        return;
      }
      const savedRule = storeChannelRule(rule);
      renderChannelRuleList();
      renderChannelRuleSummary();
      applyChannelRules([savedRule], `channel rule for ${savedRule.channel}`);
    }

    function applyAllPendingChannelRules() {
      applyChannelRules(state.channelRules, `${state.channelRules.length} channel rules`);
    }

    function applyChannelRules(rules, label) {
      const normalizedRules = normalizeChannelRules(rules);
      const impact = getCombinedChannelRuleImpact(state.videos, state.decisions, normalizedRules);
      if (!impact.affectedIds.length) {
        showToast("These channel rules have no pending changes.");
        return;
      }
      const ok = confirm([
        `Apply ${label}?`,
        "",
        `Matching videos: ${impact.matchCount}`,
        `Status changes: ${impact.statusChangeCount}`,
        `Tags added: ${impact.tagAdditionCount}`,
        `Affected videos: ${impact.affectedIds.length}`,
        "",
        "Existing statuses are preserved by default modes. An undo snapshot will be created.",
      ].join("\n"));
      if (!ok) return;
      if (!addHistoryEntry(`Applied ${label} to ${impact.affectedIds.length} videos`, "channel-rule", impact.affectedIds)) {
        showToast("Channel rule application cancelled because the local safety snapshot could not be saved.");
        return;
      }

      const updatedAt = new Date().toISOString();
      for (const rule of normalizedRules) {
        for (const video of state.videos) {
          if (String(video.channel || "").trim().toLowerCase() !== rule.channel.toLowerCase()) continue;
          const current = getDecision(video.videoId);
          const next = getChannelRuleDecision(current, rule, updatedAt);
          if (!areDecisionsEqual(current, next)) state.decisions[video.videoId] = next;
        }
      }
      saveDecisions();
      state.selectedIds.clear();
      renderTagFilters();
      render();
      if (els.channelRulesDialog.open) {
        renderChannelRuleList();
        renderChannelRulePreview();
      }
      showToast(`Applied channel rules to ${impact.affectedIds.length} videos. You can restore the safety snapshot from history.`);
    }

    function formatChannelRuleMode(mode) {
      return ({
        none: "No status default",
        "default-keep": "Keep new/unreviewed",
        "default-review": "Review new/unreviewed",
        "always-keep": "Always keep",
        "always-review": "Always review",
      })[mode] || "No status default";
    }

    return Object.freeze({
      buildYouTubeEmbedUrl,
      formatPreviewTime,
      openQuickPreview,
      renderQuickPreview,
      createPreviewTag,
      startPreviewSession,
      stopPreviewSession,
      closeQuickPreview,
      initializePreviewPlayer,
      sendPreviewCommand,
      handlePreviewPlayerMessage,
      updatePreviewCurrentTime,
      flushPreviewProgress,
      startPreviewDecisionTimer,
      resetPreviewDecisionTimer,
      tickPreviewDecisionTimer,
      updatePreviewTimerUi,
      setPreviewStatusAndAdvance,
      moveQuickPreview,
      openShortcutHelp,
      openVideoEditor,
      saveVideoEditor,
      renderRuleSummary,
      openRulesDialog,
      renderChannelRuleSummary,
      renderRuleChannelOptions,
      renderRuleList,
      editRule,
      resetRuleEditor,
      saveRuleEditor,
      removeUserRule,
      openChannelRulesDialog,
      getChannelRuleChannelOptions,
      openChannelRuleChannelMenu,
      closeChannelRuleChannelMenu,
      selectChannelRuleChannel,
      renderChannelRuleChannelMenu,
      renderChannelRuleList,
      getChannelRuleDraft,
      renderChannelRulePreview,
      editChannelRule,
      resetChannelRuleEditor,
      saveChannelRuleEditor,
      storeChannelRule,
      removeChannelRule,
      applyCurrentChannelRule,
      applyAllPendingChannelRules,
      applyChannelRules,
      formatChannelRuleMode,
      openGroupingAliasEditor,
      saveGroupingAliasEditor,
      closeGroupingAliasEditor,
    });
  }

  const app = root.WatchLaterApp ||= {};
  app.ui ||= {};
  app.ui.dialogs = Object.freeze({
    createDialogsUi,
  });
})(globalThis);
