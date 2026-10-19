import {
  Container,
  type ContainerOptions,
  getContainer,
} from "@cloudflare/containers";
import {
  ENVIRONMENTS,
  RENDER_LOCAL_DEFAULT_URL,
  type RenderMode,
} from "@smog/config/env/worker";
import { type RendererPort, renderResultSchema } from "@smog/render/contract";

/**
 * How `SmogRenderer` runs its container (phase 7 ruling 3):
 *
 * - `defaultPort` 8080, the render server's `PORT` in the image;
 * - `sleepAfter` 10 minutes (an in-flight request keeps it awake), a
 *   backstop only: `rendererFor` stops the container as soon as its render
 *   answers, so the instance is free for the next job (fix wave C-1);
 * - `enableInternet`: it reads the Mux source and PUTs to the Mux upload;
 * - `envVars`: `RENDER_ENVIRONMENT` (an unknown value reads as
 *   `production`, the strictest) and `REMOTION_LICENSE_KEY` only when the
 *   secret is set (ruling 14).
 */
export function rendererOptions(env: {
  ENVIRONMENT?: unknown;
  REMOTION_LICENSE_KEY?: unknown;
}): Required<
  Pick<
    ContainerOptions,
    "defaultPort" | "enableInternet" | "envVars" | "sleepAfter"
  >
> {
  const environment =
    ENVIRONMENTS.find((name) => name === env.ENVIRONMENT) ?? "production";
  const licenseKey =
    typeof env.REMOTION_LICENSE_KEY === "string"
      ? env.REMOTION_LICENSE_KEY
      : "";
  return {
    defaultPort: 8080,
    enableInternet: true,
    envVars: {
      RENDER_ENVIRONMENT: environment,
      ...(licenseKey ? { REMOTION_LICENSE_KEY: licenseKey } : {}),
    },
    sleepAfter: "10m",
  };
}

/**
 * `SmogRenderer`, the render Container's Durable Object: the Bun + Remotion
 * server of `packages/render/container/Dockerfile`, one instance per render
 * job (`getContainer(env.RENDERER, renderJobId)`, `rendererFor`), reachable
 * only through the `RENDERER` binding (no public route, so no API key).
 *
 * Exported from `src/worker.ts` whatever the env's render mode. A Durable
 * Object class that was deployed once must stay exported; the build adds
 * its binding, container and migration only with the render gate on
 * (render-config.ts).
 */
export class SmogRenderer extends Container<Env> {
  constructor(ctx: ConstructorParameters<typeof Container>[0], env: Env) {
    super(ctx, env, rendererOptions(env));
  }
}

/** What sends a request to the render server: the container's stub or `fetch`. */
type RenderFetch = (request: Request) => Promise<Response>;

/** Frees a job's renderer once its answer is in (the container's `stop()`). */
type ReleaseRenderer = (renderJobId: string) => Promise<void>;

/**
 * A `RendererPort` over HTTP (ruling 1): `POST /render` with the request,
 * and the server's `RenderResult` (validated with the contract's schema)
 * whatever its status.
 *
 * - A `503` that is not a result is the platform's capacity refusal
 *   (`@cloudflare/containers`: "There is no Container instance available"):
 *   it answers `busy`, which the Workflow waits on (`render-slot-wait-<n>`)
 *   instead of failing (phase 7 fix wave, pipeline C-1).
 * - Any other answer that is not a result (a proxy's 502, a crash) and a
 *   network fault throw, so the Workflow's `render` step retries; the
 *   step's own timeout bounds the wait.
 * - `release`, when given, runs once the answer is read (or the request
 *   failed), so a finished render frees its container at once instead of
 *   holding a slot for `sleepAfter`; its failure is logged and swallowed.
 */
export function httpRenderer(
  base: string,
  sender: (renderJobId: string) => RenderFetch,
  release?: ReleaseRenderer
): RendererPort {
  const url = new URL("/render", base).toString();
  return {
    render: async (request) => {
      try {
        const response = await sender(request.renderJobId)(
          new Request(url, {
            body: JSON.stringify(request),
            headers: { "content-type": "application/json" },
            method: "POST",
          })
        );
        const body: unknown = await response.json().catch(() => null);
        const result = renderResultSchema.safeParse(body);
        if (result.success) {
          return result.data;
        }
        if (response.status === CAPACITY_REFUSAL) {
          return {
            code: "busy",
            message: "no renderer instance is available",
            ok: false,
          };
        }
        throw new Error(
          `[render] The renderer answered ${response.status} without a render result`
        );
      } finally {
        await release?.(request.renderJobId).catch((error: unknown) => {
          console.error(
            `[render] Failed to stop the renderer of render job ${request.renderJobId}:`,
            error
          );
        });
      }
    },
  };
}

/** The status of the containers library's capacity refusal (not a result). */
const CAPACITY_REFUSAL = 503;

/** The Container's address: the stub routes any host to `defaultPort`. */
const CONTAINER_ORIGIN = "http://renderer.internal";

/**
 * The renderer of a render mode (rulings 3 and 11): `container` sends to
 * the job's own `SmogRenderer` instance (`getContainer(env.RENDERER,
 * renderJobId)`), `local` to the dev render server (`RENDER_LOCAL_URL`,
 * `bun -F @smog/render serve`), `fake` has none. `null` (`fake`, or
 * `container` without the `RENDERER` binding) fails a job with
 * `rendererUnavailable`.
 */
export function rendererFor(
  env: {
    RENDER_LOCAL_URL?: string | undefined;
    RENDERER?: DurableObjectNamespace<SmogRenderer> | undefined;
  },
  mode: RenderMode
): RendererPort | null {
  if (mode === "local") {
    return httpRenderer(
      env.RENDER_LOCAL_URL ?? RENDER_LOCAL_DEFAULT_URL,
      () => (request) => fetch(request)
    );
  }
  const namespace = env.RENDERER;
  if (mode !== "container" || !namespace) {
    return null;
  }
  return httpRenderer(
    CONTAINER_ORIGIN,
    (renderJobId) => (request) =>
      getContainer(namespace, renderJobId).fetch(request),
    // The render answered: stop its container (SIGTERM; the server exits
    // at once with no render running), so the instance is free for the
    // next job (fix wave C-1). A retry of the same job starts it again.
    (renderJobId) => getContainer(namespace, renderJobId).stop()
  );
}
