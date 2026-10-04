// src/utils/phones/tools/lifecycle.ts

export interface ResizeHandle {
  disconnect(): void;
}

export function observeResize(
  element: Element | null,
  callback: () => void,
): ResizeHandle | null {
  if ("ResizeObserver" in window && element) {
    const observer = new ResizeObserver(callback);
    observer.observe(element);
    return observer;
  }
  window.addEventListener("resize", callback);
  return {
    disconnect(): void {
      window.removeEventListener("resize", callback);
    },
  };
}

export function onPageHide(cleanup: () => void): void {
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) cleanup();
  });
}
