/**
 * `@smog/config/env/render`: the env of the render server
 * (`packages/render/src/server`, Bun; phase 7 ruling 7). In the Container
 * the Worker passes `RENDER_ENVIRONMENT` and `REMOTION_LICENSE_KEY`; the
 * rest are the image's defaults. `bun -F @smog/render serve` (local mode)
 * sets `PORT=3002` and `RENDER_ENVIRONMENT=dev`.
 */
import { z } from "zod";
import { ENVIRONMENTS, optionalValue } from "./worker";

const ABSOLUTE_PATH = /^\//;

const absoluteDir = (fallback: string) =>
  z.string().regex(ABSOLUTE_PATH, "must be an absolute path").default(fallback);

/** `1`/`true` on, `0`/`false`/empty/unset off; anything else is a typo. */
const flag = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .enum(["0", "1", "false", "true"])
    .optional()
    .transform((value) => value === "1" || value === "true")
);

export const renderServerEnvSchema = z
  .object({
    /** 8080 in the image (`defaultPort` of `SmogRenderer`), 3002 for `serve`. */
    PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
    /** Remotion's company licence key, passed to `renderMedia` when set. */
    REMOTION_LICENSE_KEY: optionalValue,
    /**
     * Lets the source and upload URLs be `http:` and the upload host be
     * any host, for the local loop and the render lane's sinks. Dev only.
     */
    RENDER_ALLOW_HTTP: flag,
    /** A Chrome Headless Shell to use instead of Remotion's own download. */
    RENDER_BROWSER_EXECUTABLE: optionalValue,
    /** The Remotion bundle built into the image (`bun src/server/bundle.ts`). */
    RENDER_BUNDLE_DIR: absoluteDir("/app/bundle"),
    /** The env the Worker runs in; unset is the strictest, `production`. */
    RENDER_ENVIRONMENT: z.enum(ENVIRONMENTS).default("production"),
    /** The job's logo and output files; deleted after each render. */
    RENDER_TMP_DIR: absoluteDir("/tmp/smog-render"),
  })
  .refine((env) => env.RENDER_ENVIRONMENT === "dev" || !env.RENDER_ALLOW_HTTP, {
    message: "is dev only (the upload URL must be an https Mux URL)",
    path: ["RENDER_ALLOW_HTTP"],
  });

export type RenderServerEnv = z.infer<typeof renderServerEnvSchema>;

/** Validates the render server's env once at start; names every invalid key. */
export function parseRenderServerEnv(env: object): RenderServerEnv {
  const result = renderServerEnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(
      `[config] Invalid render server env:\n${z.prettifyError(result.error)}`
    );
  }
  return result.data;
}
