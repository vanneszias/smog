import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  Sheet,
  SheetContent,
  SheetFooter,
  Text,
} from "@smog/ui-native";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import { mobileEnv } from "@/lib/env";

/**
 * The Turnstile challenge for the app (spec §12): the site's
 * `/turnstile-bridge` page in a WebView sheet. The page posts the token to
 * the WebView; the sheet accepts messages from the site origin only, hands
 * the token to the one request that asked for it and closes (tokens are
 * single-use, so none is kept).
 */

/** Cloudflare's challenge frames, the only other thing the page loads. */
const CHALLENGES_ORIGIN = "https://challenges.cloudflare.com";
/** A Turnstile token is about 2 KB; anything far bigger is not one. */
const TOKEN_MAX_LENGTH = 4096;
const WEBVIEW_HEIGHT = 140;

type BridgeMessage =
  | { token: string; type: "token" }
  | { type: "error" | "expired" };

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The site origin (`EXPO_PUBLIC_API_URL`), which serves the bridge. */
function siteOrigin(): string {
  return new URL(mobileEnv().EXPO_PUBLIC_API_URL).origin;
}

/**
 * A message from the bridge page, or `null` for anything else: another
 * origin, not JSON, another shape, an empty or oversized token.
 *
 * `event.url` is the top frame's URL, not the sender's: on Android the
 * bridge object is injected into every frame, so this check cannot tell
 * which frame posted. It holds because the only possible subframe is
 * Cloudflare's (the navigation lock in `allowBridgeLoad` and the page's
 * CSP `frame-src`); never rely on the origin check alone.
 */
export function parseBridgeMessage(
  event: { data: string; url: string },
  origin: string
): BridgeMessage | null {
  if (originOf(event.url) !== origin) {
    return null;
  }
  let message: unknown;
  try {
    message = JSON.parse(event.data);
  } catch {
    return null;
  }
  if (
    typeof message !== "object" ||
    message === null ||
    !("source" in message) ||
    message.source !== "smog-turnstile" ||
    !("type" in message)
  ) {
    return null;
  }
  if (message.type === "error" || message.type === "expired") {
    return { type: message.type };
  }
  if (
    message.type === "token" &&
    "token" in message &&
    typeof message.token === "string" &&
    message.token.length > 0 &&
    message.token.length <= TOKEN_MAX_LENGTH
  ) {
    return { token: message.token, type: "token" };
  }
  return null;
}

/**
 * Navigation the WebView may do: the site as the top frame, and
 * Cloudflare's challenge in a subframe. Everything else is refused.
 */
export function allowBridgeLoad(
  request: Pick<ShouldStartLoadRequest, "url"> & { isTopFrame?: boolean },
  origin: string
): boolean {
  const target = originOf(request.url);
  if (request.isTopFrame === false) {
    return target === origin || target === CHALLENGES_ORIGIN;
  }
  return target === origin;
}

export interface TurnstileSheetProps {
  onClose: () => void;
  onToken: (token: string) => void;
  open: boolean;
}

export function TurnstileSheet({
  onClose,
  onToken,
  open,
}: TurnstileSheetProps): ReactElement {
  const { i18n, t } = useTranslation();
  const origin = useMemo(siteOrigin, []);
  const [failed, setFailed] = useState(false);
  // A new key mounts a fresh WebView: a new challenge, a new token.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (open) {
      setFailed(false);
      setAttempt((value) => value + 1);
    }
  }, [open]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseBridgeMessage(event.nativeEvent, origin);
      if (!message) {
        return;
      }
      if (message.type === "token") {
        onToken(message.token);
      } else if (message.type === "error") {
        setFailed(true);
      }
      // `expired`: the widget refreshes itself and posts a new token.
    },
    [onToken, origin]
  );
  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest) => allowBridgeLoad(request, origin),
    [origin]
  );
  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((value) => value + 1);
  }, []);
  const onOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        onClose();
      }
    },
    [onClose]
  );
  const uri = `${origin}/turnstile-bridge?lang=${encodeURIComponent(i18n.language)}`;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        description={t("auth.captcha.description")}
        testID="turnstile-sheet"
        title={t("auth.captcha.label")}
      >
        {open ? (
          <View style={{ height: WEBVIEW_HEIGHT }}>
            <WebView
              applicationNameForUserAgent="SmogApp"
              incognito
              key={attempt}
              onMessage={onMessage}
              onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
              // The library checks this prefix-match list before our
              // handler, for iframes too on iOS: without the challenges
              // origin it cancels Turnstile's frame and opens it in
              // Safari. `allowBridgeLoad` stays the exact gate.
              originWhitelist={[origin, CHALLENGES_ORIGIN]}
              source={{ uri }}
              testID="turnstile-webview"
            />
          </View>
        ) : null}
        {failed ? (
          <>
            <Text accessibilityRole="alert" size="body-sm" tone="danger">
              {t("auth.captcha.failed")}
            </Text>
            <SheetFooter>
              <Button onPress={retry} variant="secondary">
                {t("auth.captcha.retry")}
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

interface TurnstileChallenge {
  /** Opens the sheet; resolves the token, or `null` when it was closed. */
  request: () => Promise<string | null>;
  sheet: TurnstileSheetProps;
}

/**
 * One challenge at a time: `request()` opens the sheet and resolves with
 * the next token (then closes it), or with `null` when the user closes it.
 * Render `<TurnstileSheet {...challenge.sheet} />` next to the form.
 */
export function useTurnstileChallenge(): TurnstileChallenge {
  const [open, setOpen] = useState(false);
  const pending = useRef<((token: string | null) => void) | null>(null);

  const settle = useCallback((token: string | null) => {
    const resolve = pending.current;
    pending.current = null;
    setOpen(false);
    resolve?.(token);
  }, []);
  useEffect(() => () => settle(null), [settle]);

  const request = useCallback(
    () =>
      new Promise<string | null>((resolve) => {
        // A request still waiting is abandoned (it sends nothing).
        pending.current?.(null);
        pending.current = resolve;
        setOpen(true);
      }),
    []
  );
  const onClose = useCallback(() => settle(null), [settle]);
  const onToken = useCallback((token: string) => settle(token), [settle]);

  return useMemo(
    () => ({ request, sheet: { onClose, onToken, open } }),
    [onClose, onToken, open, request]
  );
}
