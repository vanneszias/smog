import { env } from "cloudflare:workers";
import { parseWorkerVars } from "@smog/config/env/worker";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: (): Response => {
        try {
          const { ENVIRONMENT } = parseWorkerVars(env);
          return Response.json({ environment: ENVIRONMENT, ok: true });
        } catch (error) {
          console.error("[health] Failed to read worker vars:", error);
          throw error;
        }
      },
    },
  },
});
