import { isForeignRequest } from "@smog/rpc";
import { z } from "zod";
import { siteEnv } from "./auth";
import {
  E2E_SEED_MARKER,
  e2eSeedEnabled,
  e2eSeedSchema,
  seedStatements,
} from "./e2e-seed";

const bodySchema = z.array(e2eSeedSchema).min(1).max(20);

/**
 * `POST /dev/e2e-seed` (`src/server/e2e-seed.ts`): `[seed, …]` in one D1
 * batch. 404 outside dev, 403 cross-origin, 400 for anything but the
 * fixed operations.
 */
export async function e2eSeed(request: Request): Promise<Response> {
  const { db, vars, worker } = siteEnv();
  if (!e2eSeedEnabled(vars.ENVIRONMENT)) {
    return new Response(null, { status: 404 });
  }
  if (isForeignRequest(request, worker)) {
    return Response.json({ code: "FORBIDDEN" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "VALIDATION" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ code: "VALIDATION" }, { status: 400 });
  }
  try {
    const results = await db.batch(
      parsed.data.flatMap((seed) => seedStatements(db, seed))
    );
    return Response.json({
      changes: results.map((result) => result.meta.changes),
      marker: E2E_SEED_MARKER,
    });
  } catch (error) {
    console.error("[e2e-seed] Failed to seed:", error);
    throw error;
  }
}
