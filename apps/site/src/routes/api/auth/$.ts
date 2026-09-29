import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "../../../server/auth";

async function handle({ request }: { request: Request }): Promise<Response> {
  try {
    return await getAuth().handler(request);
  } catch (error) {
    console.error("[auth] Failed to handle an auth request:", error);
    throw error;
  }
}

export const Route = createFileRoute("/api/auth/$")({
  server: { handlers: { GET: handle, POST: handle } },
});
