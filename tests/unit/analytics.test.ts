import { describe, expect, it } from "vitest";
import {
  GA_DISABLE_KEY,
  GA_MEASUREMENT_ID,
  analyticsCookieNames,
  grantedCommands,
  parseConsent,
} from "@/utils/site/analytics";

describe("parseConsent", () => {
  it("accepts only the two stored values", () => {
    expect(parseConsent("granted")).toBe("granted");
    expect(parseConsent("denied")).toBe("denied");
    expect(parseConsent("yes")).toBeNull();
    expect(parseConsent(null)).toBeNull();
  });
});

describe("analyticsCookieNames", () => {
  it("finds _ga and _ga_<id> cookies only", () => {
    expect(analyticsCookieNames("theme=dark; _ga=GA1.1.1; _ga_HJ4=GS1; _gat=1; x=_ga")).toEqual([
      "_ga",
      "_ga_HJ4",
    ]);
    expect(analyticsCookieNames("")).toEqual([]);
  });
});

describe("grantedCommands", () => {
  it("sets denied defaults before the grant and the config", () => {
    const now = new Date(0);
    const commands = grantedCommands(now);
    expect(commands.map((command) => command.slice(0, 2))).toEqual([
      ["consent", "default"],
      ["consent", "update"],
      ["js", now],
      ["config", GA_MEASUREMENT_ID],
    ]);
    expect(commands[0]?.[2]).toMatchObject({ analytics_storage: "denied", ad_storage: "denied" });
    expect(commands[1]?.[2]).toEqual({ analytics_storage: "granted" });
  });
});

describe("GA_DISABLE_KEY", () => {
  it("is the window property Google checks: ga-disable-<measurement ID>", () => {
    expect(GA_DISABLE_KEY).toBe("ga-disable-G-HJ4YRNZ9LG");
  });
});
