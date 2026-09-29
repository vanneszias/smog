import { env } from "cloudflare:workers";
import { parseWorkerVars } from "@smog/config/env/worker";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: (): Response => {
        const { ENVIRONMENT } = parseWorkerVars(env);
        return Response.json({ environment: ENVIRONMENT, ok: true });
      },
    },
  },
});
