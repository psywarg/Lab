const CONTACT_UPSTREAM_URL =
  "https://script.google.com/macros/s/AKfycbx0Y-lkRWYkIe09b8KzzEYoFc6kNqS71tBUizAwl3gM1SxOt17IS2dD0rTUXH-5yR8X/exec";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const MAX_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 160;
const MAX_SUBJECT_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_FORM_BYTES = 16 * 1024;

const VALID_SUBJECTS = new Set([
  "General Enquiry",
  "Correction or Typo",
  "Press & Partnerships",
  "Privacy or Legal",
]);

export interface ContactEnv {
  TURNSTILE_SECRET_KEY?: string;
}

export interface ContactExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

function jsonResponse(
  body: { ok: boolean; message: string },
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function redirectToContact(
  requestUrl: string,
  state: "sent" | "error",
): Response {
  const location = new URL("/contact", requestUrl);
  location.searchParams.set("contact", state);

  return new Response(null, {
    status: 303,
    headers: {
      Location: location.toString(),
      "Cache-Control": "no-store",
    },
  });
}

function wantsJson(request: Request): boolean {
  return (
    request.headers.get("X-Requested-With") === "fetch" ||
    request.headers.get("Accept")?.includes("application/json") === true
  );
}

function trimField(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRequestTooLarge(request: Request): boolean {
  const contentLength = request.headers.get("Content-Length");
  if (!contentLength) return false;

  const parsed = Number.parseInt(contentLength, 10);
  return Number.isFinite(parsed) && parsed > MAX_FORM_BYTES;
}

interface TurnstileVerifyResponse {
  success: boolean;
}

async function verifyTurnstileToken(
  token: string,
  remoteIp: string | null,
  env: ContactEnv,
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const verifyResponse = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body,
    });
    if (!verifyResponse.ok) return false;

    const result = (await verifyResponse.json()) as TurnstileVerifyResponse;
    return result.success === true;
  } catch {
    return false;
  }
}

export async function handleContact(
  request: Request,
  env: ContactEnv,
  ctx: ContactExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) {
    return wantsJson(request)
      ? jsonResponse({ ok: false, message: "Invalid form origin." }, 403)
      : redirectToContact(request.url, "error");
  }

  if (isRequestTooLarge(request)) {
    return wantsJson(request)
      ? jsonResponse(
          { ok: false, message: "Message payload is too large." },
          413,
        )
      : redirectToContact(request.url, "error");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return wantsJson(request)
      ? jsonResponse(
          { ok: false, message: "Please submit a valid form payload." },
          400,
        )
      : redirectToContact(request.url, "error");
  }

  const name = trimField(formData.get("name"));
  const email = trimField(formData.get("email"));
  const subject = trimField(formData.get("subject"));
  const message = trimField(formData.get("message"));
  const company = trimField(formData.get("company"));
  const turnstileToken = trimField(formData.get("cf-turnstile-response"));

  if (company) {
    return wantsJson(request)
      ? jsonResponse({ ok: true, message: "Message sent successfully." })
      : redirectToContact(request.url, "sent");
  }

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isValidPayload =
    name.length > 0 &&
    name.length <= MAX_NAME_LENGTH &&
    email.length > 0 &&
    email.length <= MAX_EMAIL_LENGTH &&
    isValidEmail &&
    subject.length > 0 &&
    subject.length <= MAX_SUBJECT_LENGTH &&
    VALID_SUBJECTS.has(subject) &&
    message.length > 0 &&
    message.length <= MAX_MESSAGE_LENGTH &&
    turnstileToken.length > 0;

  if (!isValidPayload) {
    return wantsJson(request)
      ? jsonResponse(
          {
            ok: false,
            message:
              "Please provide a valid name, email, subject, and message.",
          },
          400,
        )
      : redirectToContact(request.url, "error");
  }

  const turnstileVerified = await verifyTurnstileToken(
    turnstileToken,
    request.headers.get("CF-Connecting-IP"),
    env,
  );

  if (!turnstileVerified) {
    return wantsJson(request)
      ? jsonResponse(
          {
            ok: false,
            message: "Verification failed. Please try again.",
          },
          403,
        )
      : redirectToContact(request.url, "error");
  }

  const upstreamFormData = new FormData();
  upstreamFormData.set("name", name);
  upstreamFormData.set("email", email);
  upstreamFormData.set("subject", subject);
  upstreamFormData.set("message", message);

  const upstreamPromise = (async () => {
    try {
      const initialResponse = await fetch(CONTACT_UPSTREAM_URL, {
        method: "POST",
        body: upstreamFormData,
        headers: {
          Accept: "application/json",
        },
        redirect: "manual",
      });

      const location = initialResponse.headers.get("Location");
      if (
        initialResponse.status >= 300 &&
        initialResponse.status < 400 &&
        location
      ) {
        await fetch(location, { method: "GET" });
      }
    } catch {
      // The response has already been sent; do not expose upstream failures.
    }
  })();

  ctx.waitUntil(upstreamPromise);

  return wantsJson(request)
    ? jsonResponse({ ok: true, message: "Message sent successfully." })
    : redirectToContact(request.url, "sent");
}
