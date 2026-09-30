import { MAGIC_LINK_TOKEN_PATTERN, useAuthState } from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import { Button, Heading, Spinner, Text, useToast } from "@smog/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { View } from "react-native";
import { useAuthClient } from "@/lib/auth-client";
import {
  clearMagicLinkRequest,
  pendingMagicLinkEmail,
} from "./magic-link-request";

/** The account Better Auth signed in (a good token answers with it). */
function sessionEmail(data: unknown): string | null {
  if (
    typeof data !== "object" ||
    data === null ||
    !("session" in data) ||
    typeof data.session !== "object" ||
    data.session === null ||
    !("user" in data) ||
    typeof data.user !== "object" ||
    data.user === null ||
    !("email" in data.user) ||
    typeof data.user.email !== "string"
  ) {
    return null;
  }
  return data.user.email;
}

const same = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

type Phase =
  | "deciding"
  | "confirm"
  | "switch"
  | "verifying"
  | "invalid"
  | "wrongAccount";

/** The account Better Auth signed in with the token, or null. */
async function verifyToken(
  client: ReturnType<typeof useAuthClient>,
  token: string
): Promise<string | null> {
  const result = await client.magicLink.verify({ query: { token } });
  return result.error ? null : sessionEmail(result.data);
}

function Screen({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}): ReactElement {
  return (
    <View className="flex-1 gap-6 bg-background px-4 py-6">
      <Heading level={1}>{title}</Heading>
      {children}
    </View>
  );
}

/**
 * `/magic-link?token=…`: the app's magic link (the universal link
 * `<site>/magic-link/app?token=…`, mapped by `+native-intent`). The app
 * exchanges the single-use token itself (`magicLink.verify` without a
 * callback: JSON and the session cookie, which the Expo client stores), so
 * no session cookie travels in a URL, and the link carries no address. The
 * token is never logged by this code.
 *
 * Login CSRF: anyone can send a link for their own account. So the link is
 * exchanged at once only while this app has a request pending
 * (`magic-link-request`), and then the account must be the one requested
 * (else it is signed out again). Otherwise the user confirms "Sign in with
 * the link from your email?"; a signed-in user always gets "Switch
 * account?". The toast names the account of the new session.
 */
export function MagicLinkScreen(): ReactElement {
  const params = useLocalSearchParams<{ token?: string }>();
  const token =
    typeof params.token === "string" &&
    MAGIC_LINK_TOKEN_PATTERN.test(params.token)
      ? params.token
      : null;
  const { currentEmail, exchange, phase } = useMagicLinkExchange(token);
  if (phase === "confirm" || phase === "switch") {
    return (
      <ConfirmView
        current={currentEmail ?? null}
        exchange={exchange}
        switching={phase === "switch"}
      />
    );
  }
  if (phase === "invalid" || phase === "wrongAccount") {
    return <FailedView wrongAccount={phase === "wrongAccount"} />;
  }
  return <SigningInView />;
}

/** How the exchange was started: which account it must end in, if any. */
interface ExchangeMode {
  /** The address this app requested the link for (automatic exchange). */
  expected: string | null;
  signOutFirst: boolean;
}

function useMagicLinkExchange(token: string | null): {
  currentEmail: string | null | undefined;
  exchange: (mode: ExchangeMode) => void;
  phase: Phase;
} {
  const { t } = useTranslation();
  const client = useAuthClient();
  const auth = useAuthState();
  const router = useRouter();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>(token ? "deciding" : "invalid");
  const started = useRef(false);
  const { refetch } = auth;
  const currentEmail = auth.status === "signedIn" ? auth.user?.email : null;

  const run = useCallback(
    async ({ expected, signOutFirst }: ExchangeMode): Promise<void> => {
      if (!token || started.current) {
        return;
      }
      started.current = true;
      setPhase("verifying");
      try {
        if (signOutFirst) {
          // Switching: end the current session instead of leaving it behind.
          await client.signOut();
        }
        const signedIn = await verifyToken(client, token);
        if (!signedIn) {
          setPhase("invalid");
          return;
        }
        clearMagicLinkRequest();
        if (expected && !same(signedIn, expected)) {
          // Not the link this app asked for: undo the automatic sign-in.
          await client.signOut();
          refetch();
          setPhase("wrongAccount");
          return;
        }
        refetch();
        toast({
          title: t("auth.signedInAs", { email: signedIn }),
          variant: "success",
        });
        router.replace("/");
      } catch (error) {
        // The name only: the request (and so the token) stays out of logs.
        console.error(
          "[auth] Failed to verify the magic link:",
          error instanceof Error ? error.name : "unknown error"
        );
        setPhase("invalid");
      }
    },
    [client, refetch, router, t, toast, token]
  );
  const exchange = useCallback(
    (mode: ExchangeMode) => {
      run(mode);
    },
    [run]
  );

  useEffect(() => {
    if (phase !== "deciding" || auth.status === "loading") {
      return;
    }
    if (currentEmail) {
      setPhase("switch");
      return;
    }
    const expected = pendingMagicLinkEmail();
    if (expected) {
      exchange({ expected, signOutFirst: false });
    } else {
      setPhase("confirm");
    }
  }, [auth.status, currentEmail, exchange, phase]);

  return { currentEmail, exchange, phase };
}

function ConfirmView({
  current,
  exchange,
  switching,
}: {
  current: string | null;
  exchange: (mode: ExchangeMode) => void;
  switching: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const toHome = useCallback(() => router.replace("/"), [router]);
  const accept = useCallback(
    () => exchange({ expected: null, signOutFirst: switching }),
    [exchange, switching]
  );
  return (
    <Screen
      title={
        switching
          ? t("auth.magicLink.switchTitle")
          : t("auth.magicLink.confirmTitle")
      }
    >
      <Text tone="muted">
        {switching
          ? t("auth.magicLink.switchDescription", { current })
          : t("auth.magicLink.confirmDescription")}
      </Text>
      <View className="gap-3">
        <Button onPress={accept}>
          {switching ? t("auth.magicLink.switch") : t("auth.magicLink.confirm")}
        </Button>
        <Button onPress={toHome} variant="ghost">
          {t("common.cancel")}
        </Button>
      </View>
    </Screen>
  );
}

function FailedView({ wrongAccount }: { wrongAccount: boolean }): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const toSignIn = useCallback(() => router.replace("/sign-in"), [router]);
  return (
    <Screen title={t("auth.magicLink.appTitle")}>
      <View className="gap-4">
        <Text accessibilityRole="alert" tone="danger">
          {wrongAccount
            ? t("auth.magicLink.wrongAccount")
            : t("auth.errors.linkInvalid")}
        </Text>
        <Button onPress={toSignIn}>{t("auth.magicLink.resend")}</Button>
      </View>
    </Screen>
  );
}

function SigningInView(): ReactElement {
  const { t } = useTranslation();
  return (
    <Screen title={t("auth.signingIn")}>
      <Spinner />
    </Screen>
  );
}
