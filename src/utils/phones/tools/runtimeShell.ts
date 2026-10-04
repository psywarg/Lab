// src/utils/phones/tools/runtimeShell.ts
// Small helpers for pages that talk to the shared tool runtime shell
// (components/phones/tools/Runtime.astro).

export const SHOW_CONTROLS_EVENT = "tool-runtime:show-controls";

/** Asks the shell to reveal its auto-hidden controls. */
export function showRuntimeControls(shell: Element | null | undefined): void {
  shell?.dispatchEvent(new CustomEvent(SHOW_CONTROLS_EVENT, { bubbles: true }));
}

export function isFullscreenActive(shell: HTMLElement | null | undefined): boolean {
  return shell?.dataset.fullscreen === "true";
}
