const CONTACT_UPSTREAM_URL =
  "https://script.google.com/macros/s/AKfycbx0Y-lkRWYkIe09b8KzzEYoFc6kNqS71tBUizAwl3gM1SxOt17IS2dD0rTUXH-5yR8X/exec";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const MAX_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 160;
const MAX_SUBJECT_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_FORM_BYTES = 16 * 1024;
const UPSTREAM_TIMEOUT_MS = 8000;

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

type ContactFailure = { message: string; status: number };

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

/**
 * Reads the body with a hard size cap. A `Content-Length` check alone is not
 * enough: chunked requests do not send one.
 */
async function readBodyWithLimit(
  request: Request,
  limit: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (isRequestTooLarge(request)) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

interface TurnstileVerifyResponse {
  success: boolean;
  hostname?: string;
}

/** Local development hosts, where Turnstile test keys report another hostname. */
function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

async function verifyTurnstileToken(
  token: string,
  remoteIp: string | null,
  expectedHostname: string,
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
    if (result.success !== true) return false;
    // A token solved on another site must not be accepted here.
    return isLocalHost(expectedHostname) || result.hostname === expectedHostname;
  } catch {
    return false;
  }
}

/**
 * Sends the message to the Apps Script endpoint and waits for it, following
 * its redirect by hand, so the visitor is only told "sent" when it was.
 */
async function sendUpstream(form: FormData): Promise<boolean> {
  const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  try {
    let response = await fetch(CONTACT_UPSTREAM_URL, {
      method: "POST",
      body: form,
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal,
    });
    const location = response.headers.get("Location");
    if (response.status >= 300 && response.status < 400 && location) {
      response = await fetch(location, { method: "GET", signal });
    }
    return response.ok;
  } catch {
    return false;
  }
}

function failure(request: Request, { message, status }: ContactFailure): Response {
  return wantsJson(request)
    ? jsonResponse({ ok: false, message }, status)
    : redirectToContact(request.url, "error");
}

export async function handleContact(
  request: Request,
  env: ContactEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) {
    return wantsJson(request)
      ? jsonResponse({ ok: false, message: "Invalid form origin." }, 403)
      : redirectToContact(request.url, "error");
  }

  const body = await readBodyWithLimit(request, MAX_FORM_BYTES);
  if (!body) {
    return failure(request, { message: "Message payload is too large.", status: 413 });
  }

  let formData: FormData;
  try {
    formData = await new Response(body, {
      headers: { "Content-Type": request.headers.get("Content-Type") ?? "" },
    }).formData();
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
    url.hostname,
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

  if (!(await sendUpstream(upstreamFormData))) {
    return failure(request, {
      message: "Your message could not be sent right now. Please try again in a few minutes.",
      status: 502,
    });
  }

  return wantsJson(request)
    ? jsonResponse({ ok: true, message: "Message sent successfully." })
    : redirectToContact(request.url, "sent");
}
