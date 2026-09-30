import {
  type AccountActionError,
  type AccountActionResult,
  accountActionMessage,
} from "@smog/account/client";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import { useToast } from "@smog/ui-web";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useAuthClient } from "@/lib/auth-client";

/**
 * Signs out and opens sign-in, back to the account page after: the way to
 * a fresh session when Better Auth asks for one (`freshAge`).
 */
export function useSignInAgain(): () => Promise<void> {
  const client = useAuthClient();
  const navigate = useNavigate();
  return useCallback(async () => {
    try {
      await client.signOut();
    } catch (error) {
      console.error("[account] Failed to sign out:", error);
    }
    await navigate({ search: { redirect: "/account" }, to: "/sign-in" });
  }, [client, navigate]);
}

/** The words for a failed account action (both apps use the same keys). */
export function useActionErrorMessage(): (error: AccountActionError) => string {
  const { t } = useTranslation();
  return useCallback(
    (error: AccountActionError) =>
      t(accountActionMessage(error), {
        max: PASSWORD_MAX_LENGTH,
        min: PASSWORD_MIN_LENGTH,
      }),
    [t]
  );
}

/**
 * Says how an account action went: `success` on success, the reason
 * otherwise, with "Sign in again" when a fresh session is needed.
 */
export function useActionToast(): (
  result: AccountActionResult,
  success: string
) => void {
  const { t } = useTranslation();
  const { toast } = useToast();
  const message = useActionErrorMessage();
  const signInAgain = useSignInAgain();
  return useCallback(
    (result: AccountActionResult, success: string) => {
      if (result.ok) {
        toast({ title: success, variant: "success" });
        return;
      }
      toast({
        ...(result.error === "SIGN_IN_AGAIN"
          ? {
              action: {
                label: t("account.delete.signInAgain"),
                onClick: () => {
                  signInAgain();
                },
              },
            }
          : {}),
        title: message(result.error),
        variant: "danger",
      });
    },
    [message, signInAgain, t, toast]
  );
}
