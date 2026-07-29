(function registerActionMenusUi(root) {
  "use strict";

  function createActionMenusUi(context) {
    const {
      els,
      document,
    } = context;
    const menus = Object.freeze([
      {
        root: els.importMenuRoot,
        trigger: els.importMenuButton,
        menu: els.importMenu,
      },
      {
        root: els.exportMenuRoot,
        trigger: els.exportMenuButton,
        menu: els.exportMenu,
      },
      {
        root: els.workspaceMenuRoot,
        trigger: els.workspaceMenuButton,
        menu: els.workspaceMenu,
      },
      {
        root: els.decisionsMenuRoot,
        trigger: els.decisionsMenuButton,
        menu: els.decisionsMenu,
      },
    ]);
    let openMenu = null;

    function getMenuItems(menu) {
      return Array.from(menu.querySelectorAll('[role="menuitem"]'))
        .filter(item => !item.disabled && item.getAttribute("aria-disabled") !== "true");
    }

    function setMenuOpen(config, isOpen) {
      config.menu.hidden = !isOpen;
      config.trigger.setAttribute("aria-expanded", String(isOpen));
      config.root.classList.toggle("is-open", isOpen);
    }

    function closeActionMenus(options = {}) {
      const current = openMenu;
      for (const config of menus) setMenuOpen(config, false);
      openMenu = null;
      if (options.restoreFocus && current) current.trigger.focus();
    }

    function showActionMenu(config, focusPosition = "first") {
      closeActionMenus();
      setMenuOpen(config, true);
      openMenu = config;
      const items = getMenuItems(config.menu);
      const item = focusPosition === "last" ? items[items.length - 1] : items[0];
      item?.focus();
    }

    function toggleActionMenu(config) {
      if (openMenu === config) {
        closeActionMenus({ restoreFocus: true });
      } else {
        showActionMenu(config);
      }
    }

    function handleTriggerKeydown(event, config) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      showActionMenu(config, event.key === "ArrowUp" ? "last" : "first");
    }

    function handleMenuKeydown(event, config) {
      const items = getMenuItems(config.menu);
      const currentIndex = items.indexOf(event.target);

      if (["Enter", " "].includes(event.key) && event.target.tagName === "LABEL") {
        event.preventDefault();
        event.target.click();
        closeActionMenus();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeActionMenus({ restoreFocus: true });
        return;
      }
      if (event.key === "Tab") {
        closeActionMenus();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || !items.length) return;

      event.preventDefault();
      let nextIndex;
      if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = items.length - 1;
      else if (event.key === "ArrowDown") {
        nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      } else {
        nextIndex = currentIndex < 0
          ? items.length - 1
          : (currentIndex - 1 + items.length) % items.length;
      }
      items[nextIndex].focus();
    }

    function initializeActionMenus() {
      els.importJsonAction.addEventListener("keydown", event => {
        if (!["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        els.importJsonAction.click();
      });

      for (const config of menus) {
        config.trigger.setAttribute("aria-haspopup", "menu");
        config.trigger.setAttribute("aria-expanded", "false");
        config.trigger.addEventListener("click", () => toggleActionMenu(config));
        config.trigger.addEventListener("keydown", event => handleTriggerKeydown(event, config));
        config.menu.addEventListener("keydown", event => handleMenuKeydown(event, config));
        config.menu.addEventListener("click", event => {
          if (event.target.closest('[role="menuitem"]')) closeActionMenus();
        });
        config.root.addEventListener("click", event => {
          if (event.target.closest(".split-main")) closeActionMenus();
        });
      }

      document.addEventListener("click", event => {
        if (openMenu && !openMenu.root.contains(event.target)) closeActionMenus();
      });
      document.addEventListener("keydown", event => {
        if (event.key === "Escape" && openMenu) {
          event.preventDefault();
          closeActionMenus({ restoreFocus: true });
        }
      });
    }

    return Object.freeze({
      initializeActionMenus,
      closeActionMenus,
    });
  }

  const app = root.WatchLaterApp ||= {};
  app.ui ||= {};
  app.ui.actionMenus = Object.freeze({
    createActionMenusUi,
  });
})(globalThis);
