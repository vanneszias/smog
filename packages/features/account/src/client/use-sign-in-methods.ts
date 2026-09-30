import type { SocialProvider } from "@smog/auth/react";
import { useCallback, useState } from "react";
import {
  type AccountActionResult,
  type AuthCall,
  type AuthCallError,
  thrownResult,
  toActionResult,
} from "./sign-in-methods";
import { useAccount } from "./use-account";

/**
 * The Better Auth calls for sign-in methods, as both clients (web and Expo)
 * expose them. Structural, so this package imports neither client.
 */
export interface SignInMethodsClient {
  changePassword: (body: {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions?: boolean;
  }) => AuthCall;
  linkSocial: (body: {
    callbackURL: string;
    errorCallbackURL?: string;
    idToken?: { token: string };
    provider: SocialProvider;
  }) => AuthCall;
  listAccounts: () => Promise<{
    data?: readonly { id: string; providerId: string }[] | null;
    error?: AuthCallError | null;
  }>;
  unlinkAccount: (body: { accountId: string }) => AuthCall;
}

export interface LinkOptions {
  /** Where the provider sends the user back (web: a redirect; Expo: `smog://`). */
  callbackURL: string;
  /** Where a failed link lands (`?error=` is appended). */
  errorCallbackURL?: string;
  /** A native sign-in's token (Sign in with Apple on iOS): no browser. */
  idToken?: { token: string };
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export type SignInMethodAction = "password" | SocialProvider;

export interface SignInMethodsActions {
  /** Changes the password and signs the other devices out. */
  changePassword: (input: ChangePasswordInput) => Promise<AccountActionResult>;
  /**
   * Links Google or Apple. On the web the browser leaves for the provider;
   * on Expo the auth session returns here, and the profile is read again.
   */
  link: (
    provider: SocialProvider,
    options: LinkOptions
  ) => Promise<AccountActionResult>;
  /** The action running, if any (one at a time per screen). */
  pending: SignInMethodAction | null;
  /** Unlinks a provider (Better Auth keeps the last account). */
  unlink: (provider: SocialProvider) => Promise<AccountActionResult>;
}

export interface UseSignInMethodsOptions {
  client: SignInMethodsClient;
}

/**
 * Password, Google and Apple for the signed-in user (spec §6, §16 flow 3),
 * for both apps. Never rejects: a result says why a change failed. After a
 * change the profile (`account.me`) is read again.
 */
export function useSignInMethods({
  client,
}: UseSignInMethodsOptions): SignInMethodsActions {
  const { refetch } = useAccount();
  const [pending, setPending] = useState<SignInMethodAction | null>(null);

  const run = useCallback(
    async (
      action: SignInMethodAction,
      what: string,
      call: () => Promise<AccountActionResult>
    ): Promise<AccountActionResult> => {
      setPending(action);
      try {
        const result = await call();
        if (result.ok) {
          await refetch();
        }
        return result;
      } catch (error) {
        return thrownResult(error, what);
      } finally {
        setPending(null);
      }
    },
    [refetch]
  );

  const changePassword = useCallback(
    (input: ChangePasswordInput) =>
      run("password", "change the password", async () =>
        toActionResult(
          await client.changePassword({ ...input, revokeOtherSessions: true }),
          "change the password"
        )
      ),
    [client, run]
  );

  const link = useCallback(
    (provider: SocialProvider, options: LinkOptions) =>
      run(provider, `link ${provider}`, async () =>
        toActionResult(
          await client.linkSocial({ ...options, provider }),
          `link ${provider}`
        )
      ),
    [client, run]
  );

  const unlink = useCallback(
    (provider: SocialProvider) =>
      run(provider, `unlink ${provider}`, async () => {
        const accounts = await client.listAccounts();
        const found = accounts.data?.find(
          (entry) => entry.providerId === provider
        );
        if (!found) {
          return toActionResult(
            { error: accounts.error ?? { code: "ACCOUNT_NOT_FOUND" } },
            `unlink ${provider}`
          );
        }
        return toActionResult(
          await client.unlinkAccount({ accountId: found.id }),
          `unlink ${provider}`
        );
      }),
    [client, run]
  );

  return { changePassword, link, pending, unlink };
}
