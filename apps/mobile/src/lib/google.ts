import * as WebBrowser from "expo-web-browser";
import { API_BASE_URL, ApiError, payloadFetch } from "./api";
import { storeToken } from "./session";

/**
 * The app's own deep-link scheme, registered as `"scheme"` in `app.json`:
 * `smogmobile`, **not** `smog`. The current store release (2.0.2) claims
 * `smog://` for its own `auth-callback` route, so with a scheme of its own no
 * older install's links can open this flow. Nothing stops two installed apps
 * from registering the same custom scheme — which is precisely the failure
 * mode this whole design avoids for the *session token*; reusing a scheme for
 * the *redirect itself* would reopen a smaller version of the same problem,
 * handing a one-shot code to whichever app the OS happens to pick. `endpoints/
 * oauth.ts`'s `MOBILE_REDIRECT_URI` has to match this literal exactly, or
 * `openAuthSessionAsync` never recognises the callback as this flow's own
 * redirect and just keeps waiting for it.
 */
export const REDIRECT_URI = "smogmobile://auth-callback";

/**
 * Signs in with Google, ending with a real session stored the same way
 * `signIn` and `refresh` in `./session` store one.
 *
 * ## Why the system browser, and not a WebView
 *
 * `WebBrowser.openAuthSessionAsync` is `ASWebAuthenticationSession` on iOS
 * and a Custom Tab on Android — a browser this app cannot read. A WebView
 * sign-in would be an app-controlled window around somebody's Google
 * password, which is why Google refuses it, and it would share no session
 * with the browser the person is already signed into elsewhere on the
 * device.
 *
 * ## Why the app never sees a session token in this URL
 *
 * The callback this opens is `GET /api/auth/google?client=mobile`'s own
 * callback, which — see `endpoints/oauth.ts` — answers with a redirect to
 * {@link REDIRECT_URI} carrying a **single-use, sixty-second exchange
 * code**, not a session. That code is traded for the real token at
 * `POST /mobile/session` over HTTPS, in a request body rather than a URL: a
 * session token in a custom-scheme redirect is readable from the system
 * browser's history, the OS log of the open-URL intent and, on Android, any
 * app that has registered the same scheme. See `endpoints/mobileSession.ts`
 * for the other half.
 *
 * Throws `ApiError` rather than resolving quietly when the browser reports
 * success but the callback carried no `code` — an absent code is not the
 * ordinary "the visitor closed the browser" outcome (that is
 * `result.type !== "success"`, handled below by simply returning), so
 * treating it the same way would make a broken callback look exactly like a
 * cancelled sign-in.
 */
export async function signInWithGoogle(): Promise<void> {
  const result = await WebBrowser.openAuthSessionAsync(
    `${API_BASE_URL}/api/auth/google?client=mobile`,
    REDIRECT_URI
  );

  if (result.type !== "success") {
    return;
  }

  const code = new URL(result.url).searchParams.get("code");

  if (code === null) {
    throw new ApiError("oauth", 400);
  }

  const { token } = await payloadFetch<{ token: string }>("/mobile/session", {
    body: JSON.stringify({ code }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  await storeToken(token);
}
