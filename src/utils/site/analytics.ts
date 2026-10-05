// src/utils/site/analytics.ts
// Google Analytics 4 behind an explicit opt-in. Nothing from Google is
// requested until the visitor accepts in the consent banner.

export const GA_MEASUREMENT_ID = "G-HJ4YRNZ9LG";
export const CONSENT_STORAGE_KEY = "consent:analytics";
export const CONSENT_OPEN_EVENT = "consent:open";
/**
 * Google's opt-out switch: while this window property is true, gtag.js sends
 * nothing to Google Analytics. Consent Mode alone still sends cookieless
 * pings after consent is withdrawn on a page where gtag.js already runs.
 */
export const GA_DISABLE_KEY = `ga-disable-${GA_MEASUREMENT_ID}`;

export type ConsentState = "granted" | "denied";

export function parseConsent(raw: string | null): ConsentState | null {
  return raw === "granted" || raw === "denied" ? raw : null;
}

/** Persisted across visits, so it uses localStorage rather than sessionStorage. */
export function readConsent(): ConsentState | null {
  try {
    return parseConsent(localStorage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeConsent(state: ConsentState): void {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, state);
  } catch {
    // Without storage the choice lasts for this page view only.
  }
}

/** Google Analytics cookie names present in a `document.cookie` string. */
export function analyticsCookieNames(cookieString: string): string[] {
  return cookieString
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter((name) => name === "_ga" || name.startsWith("_ga_"));
}

/**
 * The gtag commands queued before gtag.js loads, in order: Consent Mode v2
 * defaults (all denied), the visitor's grant, then the GA4 config.
 */
export function grantedCommands(now: Date): unknown[][] {
  return [
    [
      "consent",
      "default",
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
      },
    ],
    ["consent", "update", { analytics_storage: "granted" }],
    ["js", now],
    ["config", GA_MEASUREMENT_ID],
  ];
}

type GtagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  [GA_DISABLE_KEY]?: boolean;
};

let analyticsLoaded = false;

export function loadAnalytics(): void {
  const w = window as GtagWindow;
  w[GA_DISABLE_KEY] = false;
  if (analyticsLoaded) {
    // Already loaded on this page and then revoked: grant again.
    w.gtag?.("consent", "update", { analytics_storage: "granted" });
    return;
  }
  analyticsLoaded = true;
  w.dataLayer = w.dataLayer ?? [];
  // gtag.js only treats `arguments` objects as commands, not plain arrays,
  // so this must stay a classic function rather than a rest-args arrow.
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer?.push(arguments);
  };
  for (const command of grantedCommands(new Date())) w.gtag(...command);
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.append(script);
}

/** Stops analytics storage and removes the GA cookies already set. */
export function revokeAnalytics(): void {
  const w = window as GtagWindow;
  w[GA_DISABLE_KEY] = true;
  w.gtag?.("consent", "update", { analytics_storage: "denied" });
  const host = location.hostname;
  const domains = ["", host, `.${host.split(".").slice(-2).join(".")}`];
  for (const name of analyticsCookieNames(document.cookie)) {
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
    }
  }
}
