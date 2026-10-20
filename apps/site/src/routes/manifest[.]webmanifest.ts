import { createFileRoute } from "@tanstack/react-router";
import { webManifest } from "@/lib/manifest";

/** `/manifest.webmanifest` (inventory P-14): the installable app's manifest. */
function manifest(): Response {
  return new Response(JSON.stringify(webManifest()), {
    headers: {
      "cache-control": "public, max-age=3600",
      "content-type": "application/manifest+json; charset=utf-8",
    },
  });
}

export const Route = createFileRoute("/manifest.webmanifest")({
  server: { handlers: { GET: manifest } },
});
