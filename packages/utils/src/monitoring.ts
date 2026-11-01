import { redactMessage } from "./log";
import { redactUrl } from "./url";

/**
 * Error monitoring (Rustrak through the Sentry SDKs), the parts that must
 * behave the same in the Worker, the browser and the app: what an event may
 * carry, the `feature` tag, the release and the sample rate. No Sentry
 * import, so every runtime (and `bun test`) can use it; each app passes
 * these to its own SDK (`apps/site/src/worker/monitoring.ts`,
 * `apps/site/src/lib/monitoring.sdk.ts`, `apps/mobile/src/monitoring.ts`).
 *
 * The rules (docs/ERROR_MONITORING.md, "Privacy"): no cookies, bodies,
 * query strings, fragments or credential headers; URLs keep origin and
 * path with capability segments masked (`redactUrl`); free text goes
 * through `redactMessage` (addresses, URL tails, credentials, token-like
 * runs); the user is a pseudonymous id only, never an address, name or IP.
 */

export const FILTERED = "[Filtered]";

/** The three reporters, told apart by the `service` tag and the release. */
export type MonitoringService = "mobile" | "web" | "worker";

/** Keys whose values never leave the process, wherever they appear. */
const SENSITIVE_KEY =
  /pass(word|wd)?|secret|token|auth|cookie|session|api[-_]?key|signature|credential|dsn|e-?mail|^code$|^state$/i;
/** Keys that hold a URL: `url`, `http.url`, `url.full`, navigation `from`/`to`. */
const URL_KEY = /url|^from$|^to$|^href$/i;
/** The request headers an event may keep; every other header is dropped. */
const KEPT_HEADERS = new Set(["accept-language", "content-type", "user-agent"]);
/** `[lessons] Failed to ...`: the project's log prefix (AGENTS.md). */
const FEATURE_PREFIX = /^\[([A-Za-z][\w.:-]{0,59})\]/;
const MAX_DEPTH = 6;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

/**
 * A value with its secrets removed: a sensitive key's value is
 * `[Filtered]`, a URL key's string goes through `redactUrl`, any other
 * string through `redactMessage`; arrays and objects are walked (up to six
 * levels, deeper is `[Filtered]`).
 */
export function scrubValue(key: string, value: unknown, depth = 0): unknown {
  if (isSensitiveKey(key)) {
    return FILTERED;
  }
  if (typeof value === "string") {
    return URL_KEY.test(key) ? redactUrl(value) : redactMessage(value);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return FILTERED;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(key, item, depth + 1));
  }
  const result: Record<string, unknown> = {};
  for (const [name, item] of Object.entries(value)) {
    result[name] = scrubValue(name, item, depth + 1);
  }
  return result;
}

function scrubRecord(
  record: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  return record === undefined
    ? undefined
    : (scrubValue("", record) as Record<string, unknown>);
}

/** The `feature` tag of a log line: `[lessons] Failed to ...` is `lessons`. */
export function featureOf(text: unknown): string | undefined {
  return typeof text === "string" ? FEATURE_PREFIX.exec(text)?.[1] : undefined;
}

/**
 * The subset of a Sentry event this module touches. Structural, so every
 * SDK's `ErrorEvent`, `TransactionEvent` and `Breadcrumb` are assignable
 * (the mobile SDK is a major behind the site's).
 */
interface ScrubbableBreadcrumb {
  data?: Record<string, unknown>;
  message?: string;
}

interface ScrubbableSpan {
  data?: Record<string, unknown>;
  description?: string;
}

export interface ScrubbableEvent {
  breadcrumbs?: ScrubbableBreadcrumb[];
  contexts?: Record<string, Record<string, unknown> | undefined>;
  exception?: { values?: Array<{ value?: string }> };
  extra?: Record<string, unknown>;
  logentry?: { message?: string; params?: unknown[] };
  message?: string;
  request?: {
    cookies?: unknown;
    data?: unknown;
    headers?: Record<string, string>;
    query_string?: unknown;
    url?: string;
  };
  spans?: ScrubbableSpan[];
  tags?: Record<string, unknown>;
  transaction?: string;
  user?: Record<string, unknown>;
}

function scrubBreadcrumbFields(breadcrumb: ScrubbableBreadcrumb): void {
  if (breadcrumb.message !== undefined) {
    breadcrumb.message = redactMessage(breadcrumb.message);
  }
  breadcrumb.data = scrubRecord(breadcrumb.data);
}

function scrubRequest(request: NonNullable<ScrubbableEvent["request"]>): void {
  request.cookies = undefined;
  request.data = undefined;
  request.query_string = undefined;
  if (request.url !== undefined) {
    request.url = redactUrl(request.url);
  }
  if (request.headers) {
    const kept: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.headers)) {
      if (KEPT_HEADERS.has(name.toLowerCase())) {
        kept[name] = value;
      }
    }
    request.headers = kept;
  }
}

/** Only the pseudonymous id (and the `service` the SDK may add) stays. */
function scrubUser(user: Record<string, unknown>): Record<string, unknown> {
  return typeof user.id === "string" || typeof user.id === "number"
    ? { id: user.id }
    : {};
}

/**
 * `beforeSend` and `beforeSendTransaction`: the event without cookies,
 * bodies, query strings, credential headers, addresses or tokens, with a
 * `feature` tag from the log prefix when it has one. Mutates and returns
 * the event (the SDK hooks expect that).
 */
export function scrubMonitoringEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.request) {
    scrubRequest(event.request);
  }
  if (event.user) {
    event.user = scrubUser(event.user);
  }
  tagFeature(event);
  scrubText(event);
  event.extra = scrubRecord(event.extra);
  if (event.tags) {
    event.tags = scrubRecord(event.tags);
  }
  scrubTrace(event);
  return event;
}

/**
 * The `feature` tag from the log line's prefix (`captureConsoleIntegration`:
 * the line is the message, or the first argument when an Error was logged
 * with it). A tag the reporter set itself wins.
 */
function tagFeature(event: ScrubbableEvent): void {
  const arguments_ = event.extra?.arguments;
  const feature =
    featureOf(event.message) ??
    featureOf(event.logentry?.message) ??
    (Array.isArray(arguments_) ? featureOf(arguments_[0]) : undefined);
  if (feature && event.tags?.feature === undefined) {
    event.tags = { ...event.tags, feature };
  }
}

/** The message, the log entry and the exception values, redacted. */
function scrubText(event: ScrubbableEvent): void {
  if (event.message !== undefined) {
    event.message = redactMessage(event.message);
  }
  if (event.logentry) {
    if (event.logentry.message !== undefined) {
      event.logentry.message = redactMessage(event.logentry.message);
    }
    event.logentry.params = undefined;
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.value !== undefined) {
      exception.value = redactMessage(exception.value);
    }
  }
}

/** The transaction, its spans, breadcrumbs and trace data. */
function scrubTrace(event: ScrubbableEvent): void {
  if (event.transaction !== undefined) {
    event.transaction = scrubTransactionName(event.transaction);
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    scrubBreadcrumbFields(breadcrumb);
  }
  for (const span of event.spans ?? []) {
    if (span.description !== undefined) {
      span.description = scrubTransactionName(span.description);
    }
    span.data = scrubRecord(span.data);
  }
  const trace = event.contexts?.trace;
  if (trace?.data && typeof trace.data === "object") {
    trace.data = scrubValue("", trace.data);
  }
}

const METHOD_PREFIX = /^([A-Z]+ )(.*)$/s;

/**
 * A transaction or span name: `GET /lists/<token>?x` keeps the method and
 * a redacted path; a route pattern (`/lists/$shareToken`) or an operation
 * name has nothing to mask and stays as it is.
 */
export function scrubTransactionName(name: string): string {
  const match = METHOD_PREFIX.exec(name);
  const method = match?.[1] ?? "";
  const rest = match?.[2] ?? name;
  return rest.startsWith("/") || rest.includes("://")
    ? `${method}${redactUrl(rest)}`
    : name;
}

/** `beforeBreadcrumb`: the same scrubbing, one breadcrumb at a time. */
export function scrubMonitoringBreadcrumb<T extends ScrubbableBreadcrumb>(
  breadcrumb: T
): T {
  scrubBreadcrumbFields(breadcrumb);
  return breadcrumb;
}

/**
 * The release of a build: `smog-<service>@<sha>` when the build knows its
 * commit, else undefined (the SDK then sends none).
 */
export function monitoringRelease(
  service: Exclude<MonitoringService, "mobile">,
  commit: string | undefined
): string | undefined {
  const sha = commit?.trim();
  return sha ? `smog-${service}@${sha}` : undefined;
}

/** Performance sampling: 10 % of production, everything elsewhere. */
export function tracesSampleRate(environment: string): number {
  return environment === "production" ? 0.1 : 1;
}
