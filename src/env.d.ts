// =========================================== //
// File: src/env.d.ts (Environment Variables)  //
// =========================================== //

interface Window {
  __gaInitialized?: boolean;
  __themeControllerReady?: boolean;
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
  applyTheme?: () => void;
  setThemePreference?: (theme: "light" | "dark" | "system") => void;
  showToast?: (
    message: string,
    type?: "success" | "info" | "warning" | "error",
  ) => void;
  webkitAudioContext?: typeof AudioContext;
  onloadTurnstileCallback?: () => void;
  turnstile?: {
    render: (
      container: string | HTMLElement,
      options: {
        sitekey: string;
        theme?: "light" | "dark" | "auto";
        callback?: (token: string) => void;
        "expired-callback"?: () => void;
        "error-callback"?: () => void;
      },
    ) => string | undefined;
    reset: (widgetIdOrContainer?: string | HTMLElement) => void;
    getResponse: (
      widgetIdOrContainer?: string | HTMLElement,
    ) => string | undefined;
  };
}

