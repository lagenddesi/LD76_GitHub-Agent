import { elements } from "./dom.js";
import { showScreen, closeNavigation } from "./ui.js";

export function initializeNavigation() {
  elements.navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const screen =
        button.dataset.navigate;

      if (!screen) {
        return;
      }

      showScreen(screen);
    });
  });

  if (elements.menuButton) {
    elements.menuButton.addEventListener(
      "click",
      toggleNavigation
    );
  }

  showScreen("chat");
}

export function toggleNavigation() {
  if (!elements.mainNavigation) {
    return;
  }

  const isOpen =
    elements.mainNavigation.classList.contains(
      "open"
    );

  if (isOpen) {
    closeNavigation();
    return;
  }

  elements.mainNavigation.classList.add(
    "open"
  );

  elements.menuButton?.setAttribute(
    "aria-expanded",
    "true"
  );
}
