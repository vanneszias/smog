import { createFileRoute } from "@tanstack/react-router";
import { devMailJson } from "../../server/dev-mail";

export const Route = createFileRoute("/dev/mail.json")({
  server: { handlers: { GET: (): Promise<Response> => devMailJson() } },
});
