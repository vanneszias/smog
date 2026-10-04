import { MUX_DEFAULT_API_URL } from "@smog/config/env/worker";
import type { ZodType } from "zod";

/**
 * The part of the Worker env the Mux client reads (`@smog/config/env/worker`).
 * `MUX_API_URL` points at the Mux fake in tests and e2e.
 */
export interface MuxEnv {
  /** Outside `dev` the client always talks to the real Mux API. */
  ENVIRONMENT?: string | undefined;
  MUX_API_URL?: string | undefined;
  MUX_TOKEN_ID?: string | undefined;
  MUX_TOKEN_SECRET?: string | undefined;
}

/** `fetch` as the client calls it (the fake implements just this). */
export type MuxFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface MuxClientOptions {
  /** Tests inject the in-memory fake (`@smog/video/testing`); the Worker's `fetch` otherwise. */
  fetch?: MuxFetch | undefined;
}

/**
 * A thin, typed Mux Video REST client over `fetch` (no SDK: DECISIONS,
 * phase 5 task 3). It holds no state beyond the credentials, so building
 * one per request is free.
 */
export interface Mux {
  readonly apiUrl: string;
  readonly authorization: string;
  readonly fetch: MuxFetch;
  /** Per API call; `MUX_REQUEST_TIMEOUT_MS` unless set (tests). */
  readonly timeoutMs?: number;
}

/**
 * How long one Mux API call may take before it is aborted (phase 7 fix
 * wave M-1): a hung call must not outlive the Workflow step that made it.
 */
export const MUX_REQUEST_TIMEOUT_MS = 30_000;

/** A Mux API answer that is not 2xx (404 is returned as `null` by the lookups). */
export class MuxApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "MuxApiError";
    this.status = status;
  }
}

const TRAILING_SLASHES = /\/+$/;

/**
 * The Mux client, or `null` when the access token is not configured
 * (staging before its secrets are set): callers then answer
 * `INVALID_STATE` and the admin UI offers the pasted playback id only.
 */
export function createMux(
  env: MuxEnv,
  options: MuxClientOptions = {}
): Mux | null {
  const id = env.MUX_TOKEN_ID;
  const secret = env.MUX_TOKEN_SECRET;
  if (!(id && secret)) {
    return null;
  }
  // Defence in depth (the env schema refuses it too): staging and
  // production never send the token to a URL other than api.mux.com.
  const deployed = env.ENVIRONMENT !== undefined && env.ENVIRONMENT !== "dev";
  const apiUrl = (
    (deployed ? undefined : env.MUX_API_URL) || MUX_DEFAULT_API_URL
  ).replace(TRAILING_SLASHES, "");
  return {
    apiUrl,
    authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    // Bound: a bare `fetch` reference loses its `this` in workerd.
    fetch: options.fetch ?? ((input, init) => fetch(input, init)),
  };
}

interface RequestOptions<T> {
  body?: unknown;
  method?: "GET" | "POST" | "PUT";
  /** Answers 404 with `null` instead of throwing. */
  nullOn404?: boolean;
  schema: ZodType<T>;
}

/**
 * One Mux API call: `{ data }` parsed with `schema`. A non-2xx answer (or
 * a body that does not match) throws `MuxApiError`, logged with `[video]`
 * and without the credentials. A call that takes longer than
 * `MUX_REQUEST_TIMEOUT_MS` is aborted and throws.
 */
export async function muxRequest<T>(
  mux: Mux,
  path: string,
  options: RequestOptions<T> & { nullOn404: true }
): Promise<T | null>;
export async function muxRequest<T>(
  mux: Mux,
  path: string,
  options: RequestOptions<T>
): Promise<T>;
export async function muxRequest<T>(
  mux: Mux,
  path: string,
  { body, method = "GET", nullOn404 = false, schema }: RequestOptions<T>
): Promise<T | null> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: mux.authorization,
  };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  let response: Response;
  try {
    response = await mux.fetch(`${mux.apiUrl}${path}`, {
      body: body === undefined ? null : JSON.stringify(body),
      headers,
      method,
      signal: AbortSignal.timeout(mux.timeoutMs ?? MUX_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`[video] Failed to reach Mux (${method} ${path}):`, error);
    throw error;
  }
  if (response.status === 404 && nullOn404) {
    await response.body?.cancel();
    return null;
  }
  if (!response.ok) {
    await response.body?.cancel();
    const error = new MuxApiError(
      `[video] Mux answered ${response.status} to ${method} ${path}`,
      response.status
    );
    console.error(error.message);
    throw error;
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch (cause) {
    const error = new MuxApiError(
      `[video] Mux answered ${method} ${path} with a body that is not JSON`,
      response.status,
      { cause }
    );
    console.error(error.message);
    throw error;
  }
  const parsed = schema.safeParse(
    (json as { data?: unknown } | null)?.data ?? null
  );
  if (!parsed.success) {
    const error = new MuxApiError(
      `[video] Mux answered ${method} ${path} with an unexpected body`,
      response.status
    );
    console.error(error.message, parsed.error.issues.slice(0, 3));
    throw error;
  }
  return parsed.data;
}
