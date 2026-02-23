import { createFileRoute, redirect } from "@tanstack/react-router";

interface SearchParams {
  gestureId?: string;
}

export const Route = createFileRoute("/sponsor/")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    gestureId: (search.gestureId as string) || undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/sponsors/",
      search,
    });
  },
});
