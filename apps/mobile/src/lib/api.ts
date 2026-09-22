import { DEFAULT_LOCALE, type Locale } from "./locale";
import { clearToken, getToken } from "./session";

/**
 * Where Payload lives when nothing overrides it — the staging Worker
 * (`apps/site/wrangler.jsonc`'s `staging` environment, `smog-site-staging`).
 * `EXPO_PUBLIC_API_URL` points this at production, or at a local `wrangler
 * dev`, without a code change.
 */
const DEFAULT_API_BASE_URL = "https://smog-site-staging.vanneszias.workers.dev";

/**
 * `process.env.EXPO_PUBLIC_API_URL`, with the staging Worker as its
 * default. Exported as a convenience for anything that wants to show or log
 * where the app is pointed (a settings screen, say) — **not** what
 * `payloadFetch` itself builds a request from. See that function for why.
 */
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL;

/**
 * A Payload error, carrying the status a caller needs to branch on (a 401
 * means "sign in again", a 403 means "not allowed", anything else is
 * probably worth showing) and a `code` a caller can put in front of a
 * person.
 *
 * `code` is Payload's first error message when the response body parsed as
 * one, or the literal string `"network"` when the request never completed
 * at all (offline, DNS failure, timeout) — the two failures look identical
 * to a screen unless something tells them apart, and this is that
 * something.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, status: number) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

interface PayloadErrorBody {
  errors?: { message?: string }[];
}

/**
 * The message a caller sees for a non-2xx response.
 *
 * Payload's own error body is JSON (`{ errors: [{ message }] }`), but
 * nothing upstream of this app guarantees the response is Payload's: a
 * Cloudflare error page is HTML, and a proxy timeout can be plain text.
 * `response.json()` throws a `SyntaxError` on either, and letting that
 * escape uncaught would replace "Forbidden" with "Unexpected token <" in
 * whatever eventually reads `error.message` — so parsing failure falls back
 * to the response's status text instead of propagating.
 */
async function errorCodeFrom(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as PayloadErrorBody;
    const message = body.errors?.[0]?.message;

    return typeof message === "string" && message.length > 0
      ? message
      : response.statusText || "unknown";
  } catch {
    return response.statusText || "unknown";
  }
}

export type PayloadFetchInit = RequestInit & {
  locale?: Locale;
  /** Attaches the session's `Authorization` header, when there is one. */
  auth?: boolean;
};

/**
 * The one function every screen in this app makes a Payload request
 * through.
 *
 * Four things have to be true of every request, and a client per resource is
 * how three of them end up true in five screens and false in the sixth: the
 * right base URL, `?locale=` on every read, the `Authorization` header when
 * `auth` is requested and there is a session, and a 401 that clears that
 * session rather than being retried forever with the same stale token.
 *
 * The base URL is read from `process.env.EXPO_PUBLIC_API_URL` **inside**
 * this function, not from the `API_BASE_URL` this module also exports.
 * Stage 5 lost a `next build` to a client constructed at module scope from
 * an unset variable (`createMollieClient({ apiKey: "" })`, thrown from
 * inside its own constructor) — a failure that took down a file with
 * nothing to do with payments. Nothing here would throw either way (the
 * fallback keeps `new URL(...)` from ever seeing `undefined`), but the
 * request is still built from a fresh read every call, so a future change
 * to how the base URL is computed cannot make this module fail to import
 * under a test runner — or a bundler — that has not set the variable.
 */
export async function payloadFetch<T>(
  path: string,
  init?: PayloadFetchInit
): Promise<T> {
  const {
    auth = false,
    locale = DEFAULT_LOCALE,
    headers,
    ...rest
  } = init ?? {};

  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL;
  const url = new URL(`${apiBaseUrl}/api${path}`);
  url.searchParams.set("locale", locale);

  const requestHeaders = new Headers(headers);

  if (auth) {
    const token = await getToken();

    if (token !== null) {
      // Payload's `extractJWT` reads `Authorization: JWT <token>`, not the
      // `Bearer` scheme — see `payload/dist/auth/extractJWT.js`.
      requestHeaders.set("Authorization", `JWT ${token}`);
    }
  }

  let response: Response;

  try {
    response = await fetch(url.toString(), {
      ...rest,
      headers: requestHeaders,
    });
  } catch {
    throw new ApiError("network", 0);
  }

  if (!response.ok) {
    if (response.status === 401) {
      await clearToken();
    }

    throw new ApiError(await errorCodeFrom(response), response.status);
  }

  return (await response.json()) as T;
}
