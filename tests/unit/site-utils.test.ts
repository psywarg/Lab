import { describe, expect, it } from "vitest";
import { escapeHtml } from "@/utils/site/html";
import { jsonForScript } from "@/utils/site/json";
import { remapDeviceAxes } from "@/utils/phones/tools/orientation";

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });
});

describe("jsonForScript", () => {
  it("cannot close a script element and still round-trips", () => {
    const value = { text: "</script><script>alert(1)</script>& " };
    const output = jsonForScript(value);
    expect(output).not.toContain("</script");
    expect(output).not.toContain(" ");
    expect(JSON.parse(output)).toEqual(value);
  });
});

describe("remapDeviceAxes", () => {
  it("rotates device axes to match the screen angle", () => {
    expect(remapDeviceAxes(1, 2, 0)).toEqual({ x: 1, y: 2 });
    expect(remapDeviceAxes(1, 2, 90)).toEqual({ x: -2, y: 1 });
    expect(remapDeviceAxes(1, 2, 180)).toEqual({ x: -1, y: -2 });
    expect(remapDeviceAxes(1, 2, 270)).toEqual({ x: 2, y: -1 });
  });
});
