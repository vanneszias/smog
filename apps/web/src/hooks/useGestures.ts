import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { client } from "@/utils/orpc";

type GesturesPage = Awaited<ReturnType<typeof client.gestures.list>>;

export function useGestures() {
  const gesturesQuery = useInfiniteQuery({
    gcTime: 24 * 60 * 60 * 1000, // 24 hours - must match persister maxAge
    getNextPageParam: (lastPage: GesturesPage): string | null => {
      if (lastPage.isDone) {
        return null;
      }
      return lastPage.continueCursor ?? null;
    },
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const result = await client.gestures.list({
        cursor: pageParam ?? undefined,
        numItems: 50,
      });
      return result;
    },
    queryKey: ["gestures", "list"],
    staleTime: 5 * 60 * 1000, // 5 minutes - how long before refetch in background
  });

  // Automatically fetch next page until all gestures are loaded
  useEffect(() => {
    if (gesturesQuery.hasNextPage && !gesturesQuery.isFetchingNextPage) {
      gesturesQuery.fetchNextPage();
    }
  }, [
    gesturesQuery.hasNextPage,
    gesturesQuery.isFetchingNextPage,
    gesturesQuery.fetchNextPage,
  ]);

  // Flatten all pages into a single array
  const allGestures = useMemo(
    () => gesturesQuery.data?.pages.flatMap((page) => page.gestures) ?? [],
    [gesturesQuery.data?.pages]
  );

  return {
    error: gesturesQuery.error,
    gestures: allGestures,
    isLoading: gesturesQuery.isLoading,
    refetch: gesturesQuery.refetch,
  };
}
