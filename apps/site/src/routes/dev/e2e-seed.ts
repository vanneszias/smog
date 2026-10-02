import { createFileRoute } from "@tanstack/react-router";

/**
 * `POST /dev/e2e-seed`: the e2e's fixture writes through the running
 * Worker (`src/server/e2e-seed.ts`). Only a dev build has the handler
 * (`__SMOG_E2E_SEED__`); staging and production answer 404 and the deploy
 * guard checks their bundles.
 */
export const Route = createFileRoute("/dev/e2e-seed")({
  server: {
    handlers: {
      POST: async ({ request }): Promise<Response> => {
        if (!__SMOG_E2E_SEED__) {
          return new Response(null, { status: 404 });
        }
        const { e2eSeed } = await import("../../server/e2e-seed-handler");
        return e2eSeed(request);
      },
    },
  },
});
