/**
 * `we-moved --out <dir> --env production [--apply]` (E-13, phase 8
 * ruling 15): queues the one-time `we_moved` email to every migrated
 * account. Bun only.
 *
 * - **Production only.** Any other `--env` is refused, and so is a plan
 *   folder whose `manifest.json` was not made for `production` (B2).
 * - **Recipients** are read from production's D1 at send time through
 *   the importer's wrangler runner: `SELECT id, email, locale FROM user
 *   WHERE legacy_id IS NOT NULL`.
 * - **The send** goes through the Cloudflare Queues HTTP API to the
 *   production email queue (`env.production`'s `EMAIL_QUEUE` producer in
 *   `apps/site/wrangler.jsonc`), whose id comes from `GET
 *   /accounts/:id/queues` (`wrangler queues info` has no JSON). Each body
 *   is an `emailMessageSchema` message (`transactional/we-moved`, the
 *   user's locale, `props.url` = production's `SITE_URL`,
 *   `idempotencyKey: we_moved:<userId>`), sent with `content_type:
 *   "json"`, in batches of at most 100 messages and 256 KB. The email
 *   consumer renders and sends it like any other.
 * - **Dry by default.** Without `--apply` it reads the recipients and the
 *   queue id, and prints the counts, the batches and one sample with the
 *   address masked. With it, `we-moved-ledger.json` in the plan folder
 *   records every queued user after each batch, so a re-run sends only
 *   the rest (and the consumer's `email:sent:<key>` drops a repeat within
 *   7 days).
 * - `CLOUDFLARE_API_TOKEN` (Queues: Edit, plus D1 for wrangler) and
 *   `CLOUDFLARE_ACCOUNT_ID` come from the process env and are never
 *   printed; no address is printed either.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { emailLocale, renderEmail, WE_MOVED_OLD_ORIGIN } from "@smog/email";
import {
  EMAIL_MESSAGE_MAX_BYTES,
  emailMessageSchema,
  messageBytes,
} from "@smog/jobs";
import { z } from "zod";
import { InputError } from "../core/inputs";
import {
  Ledger,
  type ProcessEnv,
  type RateLimited,
  requireEnv,
  Throttle,
  type Timer,
  throttled,
} from "./remote";
import type { Wrangler } from "./wrangler";

const WE_MOVED_TEMPLATE = "transactional/we-moved";
export const WE_MOVED_LEDGER = "we-moved-ledger.json";
export const RECIPIENTS_SQL =
  "SELECT id, email, locale FROM user WHERE legacy_id IS NOT NULL ORDER BY id";

/** The Queues HTTP API's batch limits: 100 messages, 256 KB (read as 256 000 bytes). */
export const QUEUES_BATCH_MAX_MESSAGES = 100;
export const QUEUES_BATCH_MAX_BYTES = 256_000;
/** Cloudflare API calls per second (its limit is 1200 per 5 minutes). */
const CLOUDFLARE_CALLS_PER_SECOND = 4;

export const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";

type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface WeMovedOutput {
  error: (text: string) => void;
  log: (text: string) => void;
}

export interface WeMovedContext {
  readonly env: ProcessEnv;
  readonly fetch: Fetch;
  readonly timer: Timer;
  /** Production's wrangler (the fake in tests). */
  readonly wrangler: Wrangler;
  /** `apps/site/wrangler.jsonc` by default. */
  readonly wranglerConfigPath?: string;
}

export interface WeMovedOptions {
  readonly apply: boolean;
  readonly env: string;
  readonly outDir: string;
}

const PREFIX = "[migrate-convex]";

export const SITE_WRANGLER_CONFIG = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "..",
  "apps",
  "site",
  "wrangler.jsonc"
);

// --- Inputs ---------------------------------------------------------------

/** Refuses a plan folder whose manifest was not made for production (B2). */
function assertProductionManifest(outDir: string): void {
  const path = join(outDir, "manifest.json");
  if (!existsSync(path)) {
    throw new InputError(
      `${path} does not exist: we-moved needs the production plan that was applied.`
    );
  }
  let manifest: { target?: unknown };
  try {
    manifest = JSON.parse(readFileSync(path, "utf8")) as { target?: unknown };
  } catch (error) {
    throw new InputError(`${path} is not valid JSON.`, { cause: error });
  }
  const { target } = manifest;
  if (target !== "production") {
    throw new InputError(
      `The plan in ${outDir} was made for ${String(target)}, not production: we-moved refuses it.`
    );
  }
}

const siteConfigSchema = z.object({
  env: z.object({
    production: z.object({
      queues: z.object({
        producers: z.array(
          z.object({ binding: z.string(), queue: z.string() })
        ),
      }),
      vars: z.object({ SITE_URL: z.url({ protocol: /^https$/ }) }),
    }),
  }),
});

export interface SiteConfig {
  readonly queueName: string;
  /** Production's `SITE_URL`, as its origin. */
  readonly siteUrl: string;
}

/** Production's `SITE_URL` and email queue, from `wrangler.jsonc`. */
export function readSiteConfig(text: string): SiteConfig {
  const parsed = siteConfigSchema.safeParse(Bun.JSONC.parse(text));
  if (!parsed.success) {
    throw new InputError(
      "apps/site/wrangler.jsonc has no https `env.production.vars.SITE_URL` or no `env.production.queues.producers`."
    );
  }
  const { production } = parsed.data.env;
  const queue = production.queues.producers.find(
    (producer) => producer.binding === "EMAIL_QUEUE"
  );
  if (!queue) {
    throw new InputError(
      "apps/site/wrangler.jsonc has no EMAIL_QUEUE producer in env.production."
    );
  }
  return {
    queueName: queue.queue,
    siteUrl: new URL(production.vars.SITE_URL).origin,
  };
}

const recipientSchema = z.object({
  email: z.string(),
  id: z.string().min(1),
  locale: z.string().nullable(),
});
export type Recipient = z.infer<typeof recipientSchema>;

async function readRecipients(wrangler: Wrangler): Promise<Recipient[]> {
  const [result] = await wrangler.d1Execute({ command: RECIPIENTS_SQL });
  const parsed = z.array(recipientSchema).safeParse(result?.results ?? []);
  if (!parsed.success) {
    throw new InputError(
      "The recipients query answered rows of an unexpected shape."
    );
  }
  return parsed.data;
}

// --- Messages and batches ---------------------------------------------------

export type WeMovedMessage = z.infer<typeof emailMessageSchema>;

export interface BuiltMessages {
  /** Recipients whose address the message schema refuses: ids only. */
  readonly invalid: readonly string[];
  readonly messages: readonly { message: WeMovedMessage; userId: string }[];
}

/** One `emailMessageSchema` message per recipient (`newId` makes the message ids). */
export function buildMessages(
  recipients: readonly Recipient[],
  siteUrl: string,
  newId: () => string = () => crypto.randomUUID()
): BuiltMessages {
  const invalid: string[] = [];
  const messages: { message: WeMovedMessage; userId: string }[] = [];
  for (const recipient of recipients) {
    const parsed = emailMessageSchema.safeParse({
      id: newId(),
      idempotencyKey: `we_moved:${recipient.id}`,
      locale: emailLocale({ userLocale: recipient.locale }),
      props: { url: siteUrl },
      template: WE_MOVED_TEMPLATE,
      to: recipient.email.trim(),
    });
    if (
      !parsed.success ||
      messageBytes(parsed.data) > EMAIL_MESSAGE_MAX_BYTES
    ) {
      invalid.push(recipient.id);
      continue;
    }
    messages.push({ message: parsed.data, userId: recipient.id });
  }
  return { invalid, messages };
}

/** One message of a Queues HTTP API batch. */
interface BatchEntry {
  readonly body: WeMovedMessage;
  readonly content_type: "json";
}

export interface Batch {
  /** The request body, exactly as it is sent. */
  readonly body: string;
  /** The message ids, in the batch's order. */
  readonly messageIds: readonly string[];
  readonly userIds: readonly string[];
}

const encoder = new TextEncoder();

function byteLength(text: string): number {
  return encoder.encode(text).byteLength;
}

function batchBody(entries: readonly BatchEntry[]): string {
  return JSON.stringify({ messages: entries });
}

/** Consecutive batches of at most 100 messages and 256 KB of request body. */
export function batchMessages(messages: BuiltMessages["messages"]): Batch[] {
  const batches: Batch[] = [];
  let entries: BatchEntry[] = [];
  let userIds: string[] = [];
  const flush = (): void => {
    if (entries.length > 0) {
      batches.push({
        body: batchBody(entries),
        messageIds: entries.map((entry) => entry.body.id),
        userIds,
      });
    }
    entries = [];
    userIds = [];
  };
  for (const { message, userId } of messages) {
    const entry: BatchEntry = { body: message, content_type: "json" };
    if (
      entries.length >= QUEUES_BATCH_MAX_MESSAGES ||
      (entries.length > 0 &&
        byteLength(batchBody([...entries, entry])) > QUEUES_BATCH_MAX_BYTES)
    ) {
      flush();
    }
    entries.push(entry);
    userIds.push(userId);
  }
  flush();
  return batches;
}

/** `b***@e***.test`: enough to see the shape, not the address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const tld = dot === -1 ? "" : domain.slice(dot);
  return `${email.slice(0, 1)}***@${domain.slice(0, 1)}***${tld}`;
}

// --- The Queues HTTP API ------------------------------------------------------

class CloudflareApiError extends Error {
  readonly retryAfterSeconds: number | null;
  readonly status: number;
  constructor(message: string, status: number, retryAfter: number | null) {
    super(`${PREFIX} ${message}`);
    this.name = "CloudflareApiError";
    this.retryAfterSeconds = retryAfter;
    this.status = status;
  }
}

const DELTA_SECONDS = /^\d{1,9}$/;

const apiEnvelopeSchema = z.looseObject({
  errors: z
    .array(z.looseObject({ code: z.number().optional(), message: z.string() }))
    .default([]),
  result: z.unknown(),
  result_info: z.looseObject({ total_pages: z.number().optional() }).nullish(),
  success: z.boolean(),
});

interface ApiCredentials {
  readonly accountId: string;
  readonly token: string;
}

/** What a failed answer means for the token, when Cloudflare says it. */
function hint(status: number): string {
  if (status === 401 || status === 403) {
    return " The token needs Queues: Edit on this account.";
  }
  return "";
}

async function cloudflareRequest(
  fetchImpl: Fetch,
  credentials: ApiCredentials,
  what: string,
  path: string,
  init: { body?: string; method: "GET" | "POST" } = { method: "GET" }
): Promise<z.infer<typeof apiEnvelopeSchema>> {
  const response = await fetchImpl(
    `${CLOUDFLARE_API}/accounts/${encodeURIComponent(credentials.accountId)}${path}`,
    {
      headers: {
        authorization: `Bearer ${credentials.token}`,
        ...(init.body === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      method: init.method,
      ...(init.body === undefined ? {} : { body: init.body }),
    }
  );
  const retryAfter = response.headers.get("retry-after")?.trim() ?? "";
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // Reported below.
  }
  const parsed = apiEnvelopeSchema.safeParse(json);
  if (!(response.ok && parsed.success && parsed.data.success)) {
    const reason = parsed.success
      ? parsed.data.errors.map((error) => error.message).join("; ")
      : "no API answer";
    throw new CloudflareApiError(
      `The Queues API answered ${response.status} to ${what}: ${reason || "no reason given"}.${hint(response.status)}`,
      response.status,
      DELTA_SECONDS.test(retryAfter) ? Number.parseInt(retryAfter, 10) : null
    );
  }
  return parsed.data;
}

const queueListSchema = z.array(
  z.looseObject({ queue_id: z.string(), queue_name: z.string() })
);

/** The id of the queue named `name`, from `GET /accounts/:id/queues` (every page). */
async function queueIdOf(
  fetchImpl: Fetch,
  credentials: ApiCredentials,
  call: CloudflareCall,
  name: string
): Promise<string> {
  for (let page = 1; ; page += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one page after the other.
    const answer = await call(() =>
      cloudflareRequest(
        fetchImpl,
        credentials,
        "the queue list",
        `/queues?page=${page}`
      )
    );
    const queues = queueListSchema.safeParse(answer.result);
    if (!queues.success) {
      throw new CloudflareApiError(
        "The Queues API answered the queue list with an unexpected shape.",
        200,
        null
      );
    }
    const found = queues.data.find((queue) => queue.queue_name === name);
    if (found) {
      return found.queue_id;
    }
    const pages = answer.result_info?.total_pages ?? 1;
    if (queues.data.length === 0 || page >= pages) {
      throw new InputError(
        `The account has no queue named ${name} (ensure-cloudflare-resources creates it).`
      );
    }
  }
}

type CloudflareCall = <T>(call: () => Promise<T>) => Promise<T>;

function cloudflareRateLimit(error: unknown): RateLimited | null {
  return error instanceof CloudflareApiError && error.status === 429
    ? { retryAfterSeconds: error.retryAfterSeconds }
    : null;
}

// --- The command ----------------------------------------------------------------

const ledgerEntrySchema = z.object({
  messageId: z.string(),
  queuedAt: z.string(),
});

export async function runWeMoved(
  options: WeMovedOptions,
  context: WeMovedContext,
  out: WeMovedOutput
): Promise<number> {
  if (options.env !== "production") {
    throw new InputError(
      `we-moved runs on production only (phase 8 ruling 15), not ${options.env}.`
    );
  }
  assertProductionManifest(options.outDir);
  const token = requireEnv(
    context.env,
    ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"] as const,
    "the Queues HTTP API: the token needs Queues: Edit, and D1 read for the recipients"
  );
  const credentials: ApiCredentials = {
    accountId: token.CLOUDFLARE_ACCOUNT_ID,
    token: token.CLOUDFLARE_API_TOKEN,
  };
  const site = readSiteConfig(
    readFileSync(context.wranglerConfigPath ?? SITE_WRANGLER_CONFIG, "utf8")
  );
  const recipients = await readRecipients(context.wrangler);
  const ledger = Ledger.open(
    join(options.outDir, WE_MOVED_LEDGER),
    ledgerEntrySchema
  );
  const pending = recipients.filter((recipient) => !ledger.get(recipient.id));
  const { invalid, messages } = buildMessages(pending, site.siteUrl);
  const batches = batchMessages(messages);
  const throttle = new Throttle(CLOUDFLARE_CALLS_PER_SECOND, context.timer);
  const call: CloudflareCall = (fn) =>
    throttled(throttle, context.timer, cloudflareRateLimit, fn, (seconds) =>
      out.log(`${PREFIX} The Queues API answered 429; waiting ${seconds} s.`)
    );
  const queueId = await queueIdOf(
    context.fetch,
    credentials,
    call,
    site.queueName
  );
  const sample = messages[0]?.message;
  const preview = await renderEmail(
    WE_MOVED_TEMPLATE,
    { url: site.siteUrl },
    "nl"
  );
  out.log(
    `${PREFIX} we-moved${options.apply ? " --apply" : " (dry run)"}: ${recipients.length} migrated account(s); ${recipients.length - pending.length} already queued (ledger); ${messages.length} to queue in ${batches.length} batch(es) to ${site.queueName} (${queueId}); ${invalid.length} without a usable address.`
  );
  out.log(
    `${PREFIX} Address in the email: ${site.siteUrl} (the "new address" sentence is ${site.siteUrl === WE_MOVED_OLD_ORIGIN ? "left out" : "shown"}); nl subject: ${preview.subject}`
  );
  if (invalid.length > 0) {
    out.error(
      `${PREFIX} warning: no usable address for user(s) ${invalid.join(", ")}; they get no email.`
    );
  }
  if (sample) {
    out.log(
      `${PREFIX} Sample message: ${JSON.stringify({ ...sample, to: maskEmail(sample.to) })}`
    );
  }
  if (!options.apply) {
    out.log(
      `${PREFIX} Nothing was queued. Run again with --apply to queue ${messages.length} email(s).`
    );
    return 0;
  }
  let queued = 0;
  for (const [index, batch] of batches.entries()) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one batch after the other, each recorded before the next.
      await call(() =>
        cloudflareRequest(
          context.fetch,
          credentials,
          `batch ${index + 1}`,
          `/queues/${encodeURIComponent(queueId)}/messages/batch`,
          { body: batch.body, method: "POST" }
        )
      );
    } catch (error) {
      out.error(
        `${PREFIX} Failed to queue batch ${index + 1} of ${batches.length}; ${queued} email(s) were queued and are in the ledger, so a re-run sends the rest.`
      );
      throw error;
    }
    const at = new Date(context.timer.now()).toISOString();
    ledger.record(
      batch.userIds.map(
        (userId, position) =>
          [
            userId,
            { messageId: batch.messageIds[position] ?? "", queuedAt: at },
          ] as const
      )
    );
    queued += batch.userIds.length;
  }
  out.log(
    `${PREFIX} Queued ${queued} we_moved email(s) in ${batches.length} batch(es); the ledger is ${ledger.path}.`
  );
  return 0;
}
