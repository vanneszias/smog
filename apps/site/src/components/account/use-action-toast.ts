import {
  type AccountActionResult,
  type ActionFeedback,
  useActionFeedback,
} from "@smog/account/client";
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

/** Shows an `ActionFeedback` as a toast, with "Sign in again" when asked. */
export function useShowFeedback(): (feedback: ActionFeedback) => void {
  const { t } = useTranslation();
  const { toast } = useToast();
  const signInAgain = useSignInAgain();
  return useCallback(
    ({ signInAgain: offer, title, variant }: ActionFeedback) => {
      toast({
        ...(offer
          ? {
              action: {
                label: t("account.delete.signInAgain"),
                onClick: () => {
                  signInAgain();
                },
              },
            }
          : {}),
        title,
        variant,
      });
    },
    [signInAgain, t, toast]
  );
}

/** Says how an account action went (`useActionFeedback` as a toast). */
export function useActionToast(): (
  result: AccountActionResult,
  success: string
) => void {
  const feedback = useActionFeedback();
  const show = useShowFeedback();
  return useCallback(
    (result: AccountActionResult, success: string) => {
      show(feedback(result, success));
    },
    [feedback, show]
  );
}
