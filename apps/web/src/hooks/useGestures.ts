import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { client } from "@/utils/orpc";

export function useGestures() {
  const gesturesQuery = useInfiniteQuery({
    queryKey: ["gestures", "list"],
    queryFn: async ({ pageParam }) => {
      const result = await client.gestures.list({
        cursor: pageParam ?? undefined,
        numItems: 50,
      });
      return result;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (lastPage.isDone) {
        return null;
      }
      return lastPage.continueCursor ?? null;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
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
    gestures: allGestures,
    isLoading: gesturesQuery.isLoading,
    error: gesturesQuery.error,
    refetch: gesturesQuery.refetch,
  };
}
