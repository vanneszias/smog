/**
 * Task 6: the email previews (`admin.emails.*`, A-25, W-07). Everything
 * exported here is part of `@smog/admin/client` (`index.ts` re-exports this
 * file). Reads only: a preview is never sent.
 */
import type { EmailTemplateId } from "@smog/email/samples";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAdminKey, useAdminRpc } from "./slice";

/** The templates change with a deploy, the texts with a translator's edit: refetch after 30 s. */
const TEMPLATES_STALE_TIME = 30_000;

/** Every registered template with its sample subject per enabled language. */
export function useEmailTemplates() {
  const rpc = useAdminRpc();
  const scoped = useAdminKey();
  const options = rpc.emails.list.queryOptions({
    staleTime: TEMPLATES_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/**
 * One template rendered from its sample in `locale`; off while `template`
 * is null. The previous preview stays on screen while the next one loads.
 */
export function useEmailPreview(
  template: EmailTemplateId | null,
  locale: string
) {
  const rpc = useAdminRpc();
  const scoped = useAdminKey();
  const options = rpc.emails.preview.queryOptions({
    enabled: template !== null,
    // Never sent while `template` is null (`enabled`).
    input: { locale, template: template ?? "auth/otp" },
    placeholderData: keepPreviousData,
    staleTime: TEMPLATES_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}
