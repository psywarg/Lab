import { afterEach, describe, expect, it, vi } from "vitest";
import { handleContact } from "@/worker/contact";

const SITE = "https://sortedtech.net";
const env = { TURNSTILE_SECRET_KEY: "secret" };

function validForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const fields = {
    name: "Psy",
    email: "a@example.com",
    subject: "General Enquiry",
    message: "Hello",
    "cf-turnstile-response": "token",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

function post(body: BodyInit, { json = true, origin = SITE } = {}): Request {
  return new Request(`${origin}/api/contact`, {
    method: "POST",
    body,
    headers: json ? { Accept: "application/json", "X-Requested-With": "fetch" } : {},
  });
}

type Upstream = (url: string, init?: RequestInit) => Response | Promise<Response>;

const urlOf = (input: RequestInfo | URL): string =>
  input instanceof Request ? input.url : input.toString();

/** Turnstile answers for `hostname`; the Apps Script call is handled by `upstream`. */
function mockFetch(hostname: string, upstream: Upstream) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    if (url.includes("turnstile")) {
      return Promise.resolve(Response.json({ success: true, hostname }));
    }
    return Promise.resolve(upstream(url, init));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("handleContact", () => {
  it("waits for the upstream, following its redirect, before saying sent", async () => {
    const fetchMock = mockFetch("sortedtech.net", (url) =>
      url.includes("script.google.com")
        ? new Response(null, { status: 302, headers: { Location: "https://script.googleusercontent.com/echo" } })
        : new Response("ok", { status: 200 }),
    );
    const response = await handleContact(post(validForm()), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, message: "Message sent successfully." });
    expect(fetchMock.mock.calls.map(([url]) => urlOf(url))).toEqual([
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.stringContaining("script.google.com"),
      "https://script.googleusercontent.com/echo",
    ]);
  });

  it("reports an upstream failure instead of claiming success", async () => {
    mockFetch("sortedtech.net", () => new Response("boom", { status: 500 }));
    const response = await handleContact(post(validForm()), env);
    expect(response.status).toBe(502);
    expect(((await response.json()) as { ok: boolean }).ok).toBe(false);
  });

  it("gives up on an upstream that never answers", async () => {
    // AbortSignal.timeout runs on Node's internal timer, so shorten it here
    // after checking the worker asks for 8 s.
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(20));
    mockFetch(
      "sortedtech.net",
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const response = await handleContact(post(validForm()), env);
    expect(timeoutSpy).toHaveBeenCalledWith(8000);
    expect(response.status).toBe(502);
    timeoutSpy.mockRestore();
  });

  it("rejects a Turnstile token solved for another hostname", async () => {
    const fetchMock = mockFetch("evil.example", () => new Response("ok"));
    const response = await handleContact(post(validForm()), env);
    expect(response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversize body sent without Content-Length", async () => {
    const fetchMock = mockFetch("sortedtech.net", () => new Response("ok"));
    const chunk = new TextEncoder().encode("x".repeat(4096));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 5; i += 1) controller.enqueue(chunk);
        controller.close();
      },
    });
    const request = new Request(`${SITE}/api/contact`, {
      method: "POST",
      body: stream,
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      duplex: "half",
    } as RequestInit);
    expect(request.headers.get("Content-Length")).toBeNull();
    const response = await handleContact(request, env);
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers the honeypot as sent without contacting anyone", async () => {
    const fetchMock = mockFetch("sortedtech.net", () => new Response("ok"));
    const response = await handleContact(post(validForm({ company: "Spam Ltd" })), env);
    expect(((await response.json()) as { ok: boolean }).ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirects a form post without JavaScript back with an error state", async () => {
    mockFetch("sortedtech.net", () => new Response("ok"));
    const response = await handleContact(post(validForm({ "cf-turnstile-response": "" }), { json: false }), env);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(`${SITE}/contact?contact=error`);
  });
});
