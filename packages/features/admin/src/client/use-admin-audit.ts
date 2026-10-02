import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AuditListInput } from "../schema";
import { ADMIN_STALE_TIME, useAdminKey, useAdminRpc } from "./slice";

/**
 * One page of the audit log (`admin.audit.list`), newest first. The
 * previous page stays on screen while the next one loads (no flash between
 * pages or filters).
 */
export function useAdminAudit(input: AuditListInput) {
  const rpc = useAdminRpc();
  const scoped = useAdminKey();
  const options = rpc.audit.list.queryOptions({
    input,
    placeholderData: keepPreviousData,
    staleTime: ADMIN_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/** The accounts with audit entries, for the actor filter. */
export function useAdminAuditActors() {
  const rpc = useAdminRpc();
  const scoped = useAdminKey();
  const options = rpc.audit.actors.queryOptions({
    staleTime: ADMIN_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}
