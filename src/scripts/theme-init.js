// src/scripts/theme-init.js
// Runs blocking in <head> to set the theme class before first paint. It is
// inlined by BaseLayout and its CSP hash is computed from this file in
// astro.config.ts, so the two cannot drift apart.
(() => {
  const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");

  const getStoredTheme = () => {
    try {
      const theme = localStorage.getItem("theme");
      return theme === "light" || theme === "dark" ? theme : null;
    } catch {
      return null;
    }
  };

  const syncThemeToggle = (isDark) => {
    const btn = document.querySelector("[data-theme-toggle]");
    btn?.setAttribute("aria-pressed", String(isDark));
  };

  const applyTheme = () => {
    const storedTheme = getStoredTheme();
    const isDark =
      storedTheme === "dark" ||
      (storedTheme === null && themeMedia.matches);

    document.documentElement.classList.toggle("dark", isDark);
    syncThemeToggle(isDark);
    return isDark;
  };

  const setThemePreference = (theme) => {
    try {
      if (theme === "system") {
        localStorage.removeItem("theme");
      } else {
        localStorage.setItem("theme", theme);
      }
    } catch {
      // Ignore localStorage access errors
    }

    return applyTheme();
  };

  if (!window.__themeControllerReady) {
    window.__themeControllerReady = true;
    window.applyTheme = applyTheme;
    window.setThemePreference = setThemePreference;

    const handleSystemThemeChange = () => {
      if (getStoredTheme() === null) {
        applyTheme();
      }
    };

    themeMedia.addEventListener("change", handleSystemThemeChange);
  }

  applyTheme();
})();
