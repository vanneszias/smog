import handler from "@tanstack/react-start/server-entry";
import { legacyRedirect } from "@/lib/legacy-redirects";
import { loadCategorySlugs } from "@/server/legacy-categories";

/**
 * Site Worker entry. `fetch` answers the old site's URLs with their 301
 * (`legacy-redirects.ts`) and hands every other request to TanStack Start;
 * the maintenance middleware, queue consumers and cron jobs are added in
 * later phases.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const redirect = await legacyRedirect(request, loadCategorySlugs);
    return redirect ?? (await handler.fetch(request));
  },

  queue(batch: MessageBatch): void {
    console.log(`[worker] queue ${batch.queue}`);
    batch.ackAll();
  },

  scheduled(controller: ScheduledController): void {
    console.log(`[worker] scheduled ${controller.cron}`);
  },
} satisfies ExportedHandler<Env>;
