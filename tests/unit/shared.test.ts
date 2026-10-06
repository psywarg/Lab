import { describe, expect, it } from "vitest";
import {
  isFullscreenActive,
  showRuntimeControls,
} from "@/utils/phones/tools/runtimeShell";

describe("runtime shell helpers", () => {
  it("dispatches a bubbling show-controls event", () => {
    const target = new EventTarget();
    const seen: Event[] = [];
    // The event Runtime.astro listens for.
    target.addEventListener("tool-runtime:show-controls", (event) => seen.push(event));
    showRuntimeControls(target as unknown as Element);
    showRuntimeControls(null);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.bubbles).toBe(true);
  });

  it("reads the shell's fullscreen flag", () => {
    const shell = (fullscreen?: string) => ({ dataset: { fullscreen } }) as unknown as HTMLElement;
    expect(isFullscreenActive(shell("true"))).toBe(true);
    expect(isFullscreenActive(shell("false"))).toBe(false);
    expect(isFullscreenActive(null)).toBe(false);
  });
});
