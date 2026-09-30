import { MAGIC_LINK_TOKEN_PATTERN, useAuthState } from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import { Button, Heading, Spinner, Text, useToast } from "@smog/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { View } from "react-native";
import { useAuthClient } from "@/lib/auth-client";

/** Better Auth answers a good token with the new session (no redirect). */
function isSession(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "session" in data &&
    typeof data.session === "object" &&
    data.session !== null
  );
}

/**
 * `/magic-link?token=…`: the app's magic link (the universal link
 * `<site>/magic-link/app?token=…`, mapped by `+native-intent`). The app
 * exchanges the single-use token itself (`magicLink.verify` without a
 * callback, so the server answers with JSON and the session cookie, which
 * the Expo client stores); no session cookie travels in a URL. The token is
 * never logged.
 */
export function MagicLinkScreen(): ReactElement {
  const { t } = useTranslation();
  const client = useAuthClient();
  const { refetch } = useAuthState();
  const router = useRouter();
  const { toast } = useToast();
  const params = useLocalSearchParams<{ token?: string }>();
  const token =
    typeof params.token === "string" &&
    MAGIC_LINK_TOKEN_PATTERN.test(params.token)
      ? params.token
      : null;
  const [failed, setFailed] = useState(token === null);
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!token || started.current === token) {
      return;
    }
    started.current = token;
    const verify = async (): Promise<void> => {
      try {
        const result = await client.magicLink.verify({ query: { token } });
        if (result.error || !isSession(result.data)) {
          setFailed(true);
          return;
        }
        refetch();
        toast({ title: t("auth.signedIn"), variant: "success" });
        router.replace("/");
      } catch (error) {
        // The name only: the request (and so the token) stays out of logs.
        console.error(
          "[auth] Failed to verify the magic link:",
          error instanceof Error ? error.name : "unknown error"
        );
        setFailed(true);
      }
    };
    verify();
  }, [client, refetch, router, t, toast, token]);

  const toSignIn = useCallback(() => router.replace("/sign-in"), [router]);

  return (
    <View className="flex-1 gap-6 bg-background px-4 py-6">
      <Heading level={1}>
        {failed ? t("auth.magicLink.appTitle") : t("auth.signingIn")}
      </Heading>
      {failed ? (
        <View className="gap-4">
          <Text accessibilityRole="alert" tone="danger">
            {t("auth.errors.linkInvalid")}
          </Text>
          <Button onPress={toSignIn}>{t("auth.magicLink.resend")}</Button>
        </View>
      ) : (
        <Spinner />
      )}
    </View>
  );
}
