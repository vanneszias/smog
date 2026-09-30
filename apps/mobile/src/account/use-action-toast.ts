import {
  type AccountActionResult,
  type ActionFeedback,
  useActionFeedback,
} from "@smog/account/client";
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
                onPress: () => {
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
