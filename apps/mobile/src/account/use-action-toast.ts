import {
  type AccountActionError,
  type AccountActionResult,
  accountActionMessage,
} from "@smog/account/client";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import { useToast } from "@smog/ui-native";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { useAuthClient } from "@/lib/auth-client";

/** Signs out and opens sign-in: the way to a fresh session (`freshAge`). */
export function useSignInAgain(): () => Promise<void> {
  const client = useAuthClient();
  const router = useRouter();
  return useCallback(async () => {
    try {
      await client.signOut();
    } catch (error) {
      console.error("[account] Failed to sign out:", error);
    }
    router.push("/sign-in");
  }, [client, router]);
}

/** The words for a failed account action (the same keys as the site). */
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
                onPress: () => {
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
