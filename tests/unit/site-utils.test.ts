import { describe, expect, it } from "vitest";
import { escapeHtml } from "@/utils/site/html";
import { jsonForScript } from "@/utils/site/json";
import { remapDeviceAxes } from "@/utils/phones/tools/orientation";
import { inLatinSubset, latinSubsetText } from "@/utils/site/fontSubset";

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

describe("font subset", () => {
  it("keeps ASCII and the punctuation the site uses, and drops other scripts", () => {
    for (const char of "Aa09 ©°·’“”•–—…€™é") {
      expect(inLatinSubset(char.codePointAt(0) ?? 0), char).toBe(true);
    }
    expect(inLatinSubset(0x0915)).toBe(false); // Devanagari KA
    expect(inLatinSubset(0x0142)).toBe(false); // Latin Extended-A ł
  });

  it("lists every kept character once", () => {
    const text = latinSubsetText();
    expect(new Set(text).size).toBe([...text].length);
    expect([...text].every((char) => inLatinSubset(char.codePointAt(0) ?? 0))).toBe(true);
  });
});
