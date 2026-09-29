import { createFileRoute, redirect } from "@tanstack/react-router";

interface SearchParams {
  gestureId?: string;
}

export const Route = createFileRoute("/sponsor/")({
  beforeLoad: ({ search }) => {
    throw redirect({
      search,
      to: "/sponsors/",
    });
  },
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    gestureId: (search.gestureId as string) || undefined,
  }),
});
