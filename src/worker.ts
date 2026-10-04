import { create410Response } from "./components/site/410";
import {
  handleContact,
  type ContactEnv,
  type ContactExecutionContext,
} from "./worker/contact";

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env extends ContactEnv {
  ASSETS: AssetsBinding;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ContactExecutionContext,
  ): Promise<Response> {
    const pathname = new URL(request.url).pathname;

    if (pathname === "/index" || pathname === "/index/") {
      return create410Response();
    }

    if (pathname === "/api/contact") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: {
            Allow: "POST",
            "Cache-Control": "no-store",
          },
        });
      }

      return handleContact(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
