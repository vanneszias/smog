import { createFileRoute } from "@tanstack/react-router";
import { devMailPage } from "../../server/dev-mail";

export const Route = createFileRoute("/dev/mail")({
  server: {
    handlers: { GET: ({ request }): Promise<Response> => devMailPage(request) },
  },
});
