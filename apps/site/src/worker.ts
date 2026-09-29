import handler from "@tanstack/react-start/server-entry";

/**
 * Site Worker entry. `fetch` hands every request to TanStack Start; the
 * maintenance middleware, queue consumers and cron jobs are added in later
 * phases.
 */
export default {
  fetch(request: Request): Promise<Response> | Response {
    return handler.fetch(request);
  },

  queue(batch: MessageBatch): void {
    console.log(`[worker] queue ${batch.queue}`);
    batch.ackAll();
  },

  scheduled(controller: ScheduledController): void {
    console.log(`[worker] scheduled ${controller.cron}`);
  },
} satisfies ExportedHandler<Env>;
