(function registerAccessibilityUi(root) {
  "use strict";

  const RESPONSIVE_DRAWER_QUERY = "(max-width: 980px)";
  const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "summary",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  function getFocusableElements(container) {
    if (!container || typeof container.querySelectorAll !== "function") return [];
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter(element => !element.hidden
        && element.getAttribute?.("aria-hidden") !== "true"
        && element.getAttribute?.("aria-disabled") !== "true");
  }

  function trapFocusWithin(event, container, documentRef = root.document) {
    if (event?.key !== "Tab") return false;
    const focusable = getFocusableElements(container);
    if (!focusable.length) {
      event.preventDefault();
      container?.focus?.();
      return true;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = documentRef?.activeElement;
    if (event.shiftKey && (active === first || !container.contains?.(active))) {
      event.preventDefault();
      last.focus();
      return true;
    }
    if (!event.shiftKey && (active === last || !container.contains?.(active))) {
      event.preventDefault();
      first.focus();
      return true;
    }
    return false;
  }

  function createResponsiveDrawerController(options) {
    const {
      container,
      closeButton,
      onClose,
      window: windowRef = root,
      document: documentRef = root.document,
    } = options;
    const mediaQuery = windowRef?.matchMedia?.(RESPONSIVE_DRAWER_QUERY) || {
      matches: false,
      addEventListener() {},
    };
    let isOpen = false;
    let restoreFocus = null;

    function isDrawerMode() {
      return Boolean(mediaQuery.matches);
    }

    function updateSemantics() {
      const modal = isOpen && isDrawerMode();
      container.classList?.toggle?.("is-responsive-drawer", modal);
      if (modal) {
        container.setAttribute?.("role", "dialog");
        container.setAttribute?.("aria-modal", "true");
      } else {
        container.removeAttribute?.("role");
        container.removeAttribute?.("aria-modal");
      }
    }

    function restorePreviousFocus() {
      const target = typeof restoreFocus === "function"
        ? restoreFocus()
        : restoreFocus;
      windowRef?.requestAnimationFrame?.(() => target?.focus?.());
    }

    function requestClose() {
      if (!isOpen) return;
      isOpen = false;
      updateSemantics();
      onClose?.();
      restorePreviousFocus();
    }

    function sync(open, syncOptions = {}) {
      const wasOpen = isOpen;
      isOpen = Boolean(open);
      if (syncOptions.restoreFocus) restoreFocus = syncOptions.restoreFocus;
      updateSemantics();
      if (isOpen && !wasOpen && syncOptions.autofocus !== false && isDrawerMode()) {
        windowRef?.requestAnimationFrame?.(() => closeButton?.focus?.());
      }
    }

    function handleKeydown(event) {
      if (!isOpen || !isDrawerMode()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      trapFocusWithin(event, container, documentRef);
    }

    closeButton?.addEventListener?.("click", requestClose);
    container?.addEventListener?.("keydown", handleKeydown);
    mediaQuery.addEventListener?.("change", updateSemantics);
    updateSemantics();

    return Object.freeze({
      isDrawerMode,
      requestClose,
      sync,
    });
  }

  const app = root.WatchLaterApp ||= {};
  app.ui ||= {};
  app.ui.accessibility = Object.freeze({
    RESPONSIVE_DRAWER_QUERY,
    FOCUSABLE_SELECTOR,
    getFocusableElements,
    trapFocusWithin,
    createResponsiveDrawerController,
  });
})(globalThis);
