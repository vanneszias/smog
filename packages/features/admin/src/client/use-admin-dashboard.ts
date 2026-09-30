import { useQuery } from "@tanstack/react-query";
import { ADMIN_STALE_TIME, useAdminKey, useAdminRpc } from "./slice";

/** `admin.dashboard`: the counts and the newest audit entries (A-03). */
export function useAdminDashboard() {
  const rpc = useAdminRpc();
  const scoped = useAdminKey();
  const options = rpc.dashboard.queryOptions({ staleTime: ADMIN_STALE_TIME });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}
