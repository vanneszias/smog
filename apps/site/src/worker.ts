import { ENVIRONMENTS } from "@smog/config/env/worker";
import handler from "@tanstack/react-start/server-entry";
import { legacyRedirect } from "@/lib/legacy-redirects";
import { handleAuthRequest } from "@/server/auth-handler";
import { loadCategorySlugs } from "@/server/legacy-categories";
import { respondSecurely } from "@/worker/headers";
import {
  BYPASS_PATH,
  handleBypass,
  maintenanceGate,
  SIGN_IN_ONLY,
} from "@/worker/maintenance";

/**
 * The request pipeline, in order: the maintenance gate (503 unless exempt
 * or bypassed; an admin sign-in route goes to the sign-in-only auth), the
 * admin bypass endpoint, the old site's URLs (301, `legacy-redirects.ts`),
 * then TanStack Start with the request's CSP nonce.
 */
async function route(request: Request, nonce: string): Promise<Response> {
  const gate = await maintenanceGate(request);
  if (gate === SIGN_IN_ONLY) {
    return await handleAuthRequest(request, { signInOnly: true });
  }
  if (gate) {
    return gate;
  }
  if (new URL(request.url).pathname === BYPASS_PATH) {
    return await handleBypass(request);
  }
  const redirect = await legacyRedirect(request, loadCategorySlugs);
  return redirect ?? (await handler.fetch(request, { context: { nonce } }));
}

/**
 * Site Worker entry. Every response it answers gets the security headers
 * (`worker/headers.ts`), the maintenance 503, the legacy 301s and a 500 for
 * an escaping exception included; queue consumers and cron jobs are added
 * in later phases.
 */
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    // Read raw so a broken env still gets a headed 500 (dev: no HSTS).
    const environment = ENVIRONMENTS.find((name) => name === env.ENVIRONMENT);
    return respondSecurely(environment ?? "production", (nonce) =>
      route(request, nonce)
    );
  },

  queue(batch: MessageBatch): void {
    console.log(`[worker] queue ${batch.queue}`);
    batch.ackAll();
  },

  scheduled(controller: ScheduledController): void {
    console.log(`[worker] scheduled ${controller.cron}`);
  },
} satisfies ExportedHandler<Env>;
