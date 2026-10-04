// src/components/site/410.ts

import { escapeHtml } from "../../utils/site/html";

export function create410Response(message?: string): Response {
  const responseMessage = escapeHtml(
    message ||
      "This content has been permanently removed and is no longer available.",
  );
  const html = `
<!DOCTYPE html>
<html lang="en" class="">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>410 - Content Gone</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background-color: #c9daeb;
      color: #0a0b0d;
      min-height: 100svh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      transition: background-color 500ms ease, color 500ms ease;
    }

    html.dark body {
      background-color: #17181b;
      color: #dfedfc;
    }

    .content-card {
      background-color: #dfedfc;
      border-radius: 0;
      box-shadow: 0 10px 15px -3px rgba(43, 127, 255, 0.3);
      border: 1px solid rgba(43, 127, 255, 0.25);
      padding: 1rem 0.5rem;
      margin-bottom: 1rem;
      transition: all 500ms;
      max-width: 42rem;
      width: 100%;
      text-align: center;
    }

    html.dark .content-card {
      background-color: #1d1f22;
      box-shadow: 0 10px 15px -3px rgba(43, 127, 255, 0.2);
    }

    .btn-base {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.375rem 0.875rem;
      border-radius: 0.75rem;
      gap: 0.5rem;
      font-size: 16px;
      font-weight: 500;
      color: #155dfc;
      background-color: rgba(43, 127, 255, 0.15);
      border: 1px solid transparent;
      transition: all 200ms ease-in-out;
      white-space: nowrap;
      cursor: pointer;
      touch-action: manipulation;
      text-decoration: none;
    }

    html.dark .btn-base {
      color: #51a2ff;
    }

    .btn-base:hover {
      border-color: #155dfc;
      background-color: #2b7fff;
      color: white;
    }

    html.dark .btn-base:hover {
      border-color: #51a2ff;
    }

    .btn-base:active {
      transform: scale(0.98);
    }

    h1 {
      font-size: clamp(1.375rem, calc(1.375rem + 0.58vw), 2rem);
      line-height: 1.1;
      font-weight: 700;
      margin-bottom: 1rem;
      color: #0a0b0d;
    }

    html.dark h1 {
      color: #dfedfc;
    }

    p {
      font-size: 1.125rem;
      line-height: 1.75;
      margin-bottom: 2rem;
      color: #101214;
    }

    html.dark p {
      color: #b4c6db;
    }

    @media (min-width: 768px) {
      .content-card {
        border-radius: 1.5rem;
        padding: 1rem;
      }
    }

    @media (min-width: 1024px) {
      .content-card {
        padding: 2rem;
        margin-bottom: 1.5rem;
      }
    }
  </style>
  <script>
    (function() {
      var theme = null;
      try {
        theme = localStorage.getItem('theme');
      } catch {}
      if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      }
    })();
  </script>
</head>
<body>
  <div class="content-card">
    <h1>410</h1>
    <p>
      ${responseMessage}
    </p>
    <a href="/" class="btn-base">
      Return to Homepage
    </a>
  </div>
</body>
</html>
  `;
  return new Response(html, {
    status: 410,
    statusText: "Gone",
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
