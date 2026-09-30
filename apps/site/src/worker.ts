import handler from "@tanstack/react-start/server-entry";
import { legacyRedirect } from "@/lib/legacy-redirects";
import { siteEnv } from "@/server/auth";
import { loadCategorySlugs } from "@/server/legacy-categories";
import { createNonce, withSecurityHeaders } from "@/worker/headers";
import {
  BYPASS_PATH,
  handleBypass,
  maintenanceGate,
} from "@/worker/maintenance";

/**
 * The request pipeline, in order: the maintenance gate (503 unless exempt
 * or bypassed), the admin bypass endpoint, the old site's URLs (301,
 * `legacy-redirects.ts`), then TanStack Start with the request's CSP nonce.
 */
async function route(request: Request, nonce: string): Promise<Response> {
  const blocked = await maintenanceGate(request);
  if (blocked) {
    return blocked;
  }
  if (new URL(request.url).pathname === BYPASS_PATH) {
    return await handleBypass(request);
  }
  const redirect = await legacyRedirect(request, loadCategorySlugs);
  return redirect ?? (await handler.fetch(request, { context: { nonce } }));
}

/**
 * Site Worker entry. Every response it answers gets the security headers
 * (`worker/headers.ts`), the maintenance 503 and the legacy 301s included;
 * queue consumers and cron jobs are added in later phases.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const nonce = createNonce();
    const response = await route(request, nonce);
    return withSecurityHeaders(response, {
      environment: siteEnv().vars.ENVIRONMENT,
      nonce,
    });
  },

  queue(batch: MessageBatch): void {
    console.log(`[worker] queue ${batch.queue}`);
    batch.ackAll();
  },

  scheduled(controller: ScheduledController): void {
    console.log(`[worker] scheduled ${controller.cron}`);
  },
} satisfies ExportedHandler<Env>;
