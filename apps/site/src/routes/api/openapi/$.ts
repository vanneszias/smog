import { createFileRoute } from "@tanstack/react-router";
import { handleOpenApi } from "../../../server/rpc";

function handle({ request }: { request: Request }): Promise<Response> {
  return handleOpenApi(request);
}

/** Dev and staging only (404 in production): transport, spec and reference UI. */
export const Route = createFileRoute("/api/openapi/$")({
  server: {
    handlers: {
      DELETE: handle,
      GET: handle,
      PATCH: handle,
      POST: handle,
      PUT: handle,
    },
  },
});
