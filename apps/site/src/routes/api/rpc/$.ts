import { createFileRoute } from "@tanstack/react-router";
import { handleRpc } from "../../../server/rpc";

function handle({ request }: { request: Request }): Promise<Response> {
  return handleRpc(request);
}

export const Route = createFileRoute("/api/rpc/$")({
  server: { handlers: { GET: handle, POST: handle } },
});
