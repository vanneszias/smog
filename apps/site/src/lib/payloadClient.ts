import type { Payload } from "payload";

/**
 * A booted Payload instance, imported lazily.
 *
 * Both imports are dynamic so the modules that query the database can be
 * imported by a jsdom unit test without booting Payload: `payload.config.ts`
 * resolves Cloudflare bindings at module scope, and a static import is
 * hoisted above everything that might have avoided it — including an early
 * return, which is exactly what `searchGestureIds` relies on for a blank
 * query.
 *
 * Shared by `gestureQuery.ts` and `search.ts` rather than copied into each:
 * the hoisting hazard above is the kind of thing that gets "tidied" back into
 * a static import in one copy and not the other, and the two would then
 * disagree about whether importing them is safe.
 */
export async function getPayloadClient(): Promise<Payload> {
  const [{ getPayload }, { default: config }] = await Promise.all([
    import("payload"),
    import("@/payload.config"),
  ]);

  return await getPayload({ config });
}
