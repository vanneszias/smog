import { Container, type ContainerOptions } from "@cloudflare/containers";
import { ENVIRONMENTS } from "@smog/config/env/worker";

/**
 * How `SmogRenderer` runs its container (phase 7 ruling 3):
 *
 * - `defaultPort` 8080, the render server's `PORT` in the image;
 * - `sleepAfter` 10 minutes (an in-flight request keeps it awake);
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
 * job (`getContainer(env.RENDERER, renderJobId)`, task 6), reachable only
 * through the `RENDERER` binding (no public route, so no API key).
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
