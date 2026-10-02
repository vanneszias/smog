import { createFileRoute } from "@tanstack/react-router";
import { handleAuthRequest } from "../../../server/auth-handler";

function handle({ request }: { request: Request }): Promise<Response> {
  return handleAuthRequest(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: { handlers: { GET: handle, POST: handle } },
});
