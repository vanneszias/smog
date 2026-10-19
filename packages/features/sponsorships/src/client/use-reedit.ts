/**
 * The re-edit page (S-19, ruling 11): what the link may change
 * (`sponsorships.reedit.get`), and "Send for review"
 * (`sponsorships.reedit.submit`, with Turnstile), which uploads a new logo
 * first when the sponsorship has one and the sponsor chose another.
 */
import { isDefinedError } from "@orpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { sponsorshipTokenSchema } from "../schema/tokens";
import { useSponsorshipsClient, useSponsorshipsRpc } from "./slice";
import { useLogoUpload } from "./use-logo-upload";

/** `?token=` as the procedures take it, else `null` (the page's "invalid link"). */
export function tokenParam(value: unknown): string | null {
  const parsed = sponsorshipTokenSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The link's sponsorship. `TOKEN_INVALID` / `TOKEN_EXPIRED` are final
 * answers (no retry); the page reads them from `error`.
 */
export function useReedit(token: string | null) {
  const utils = useSponsorshipsRpc();
  return useQuery({
    ...utils.reedit.get.queryOptions({
      enabled: token !== null,
      input: { token: token ?? "" },
    }),
    refetchOnWindowFocus: false,
    retry: (count, error) => !isDefinedError(error) && count < 2,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export interface ReeditRequest {
  displayName: string;
  /** A new logo (only for a sponsorship with one), else the current stays. */
  logo: Blob | null;
  token: string;
  turnstileToken: string | null;
}

/** "Send for review": the token is used and a new video is made. */
export function useReeditSubmit() {
  const client = useSponsorshipsClient();
  const upload = useLogoUpload();
  return useMutation({
    mutationFn: async ({
      displayName,
      logo,
      token,
      turnstileToken,
    }: ReeditRequest) => {
      const logoKey = logo ? await upload.mutateAsync(logo) : null;
      return await client.reedit.submit(
        {
          displayName: displayName.trim(),
          ...(logoKey ? { logoKey } : {}),
          token,
        },
        { context: { turnstileToken: turnstileToken ?? undefined } }
      );
    },
  });
}
