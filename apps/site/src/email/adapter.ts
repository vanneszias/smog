import type { PayloadEmailAdapter, SendEmailOptions } from "payload";
import { requireBinding } from "@/lib/env";

/**
 * Payload's email adapter over Cloudflare's `send_email` binding.
 *
 * There is no official adapter, and there does not need to be one: Payload's
 * `EmailAdapter` is a factory returning `{ name, defaultFromAddress,
 * defaultFromName, sendEmail }`, and `sendEmail` takes nodemailer's option
 * shape. Everything below is the translation between that shape and
 * Cloudflare's.
 *
 * ## Why this builds no MIME message, which would be worse than unnecessary
 *
 * There are two products behind the name `send_email`, and they take
 * different arguments:
 *
 * - **Email Routing**'s binding takes an `EmailMessage` built from raw MIME,
 *   constructed with `new EmailMessage(from, to, raw)` out of the
 *   `cloudflare:email` module.
 * - **Email Service**'s binding — the one whose error table the whole mail
 *   queue is written against (`E_SENDER_NOT_VERIFIED`,
 *   `E_DAILY_LIMIT_EXCEEDED`, `E_RECIPIENT_NOT_ALLOWED`) — additionally takes
 *   a structured `EmailMessageBuilder`: `{ to, from, subject, text, html }`,
 *   and composes the MIME itself.
 *
 * The installed workerd types say so directly, so this is checked rather than
 * recalled: `interface SendEmail` declares both overloads, and
 * `EmailMessageBuilder` is documented there as "Fields for composing an email
 * without constructing raw MIME".
 *
 * Taking the builder overload is not merely less code. `cloudflare:email` is a
 * workerd-only module: importing it would fail under Vitest and during
 * `next build`, which is the same shape of trap as reading the binding at
 * module scope. Hand-rolling MIME instead would mean owning header folding,
 * encoding and multipart boundaries — and a dependency that did it, `mimetext`,
 * would have to be measured against a 2.66 MiB bundle headroom to buy
 * something the platform already does. The builder costs nothing and there is
 * nothing to get wrong.
 *
 * ## The binding is read per call
 *
 * `binding` is a thunk, and it is called inside `sendEmail`. `payload.config.ts`
 * passes `() => cloudflare.env.EMAIL`, so an absent binding is an error on the
 * one request that tried to send, not a module that cannot be imported.
 *
 * The precedent is measured, not hypothetical:
 * `createMollieClient({ apiKey: "" })` throws inside its constructor, and a
 * module that built one at module scope once killed an entire `next build` from
 * a file that had nothing to do with payments. An `EMAIL` binding is absent in
 * exactly the same places a Mollie key is: during a build, and in any
 * environment that has not been given one.
 *
 * ## Nothing here logs
 *
 * Not an omission. The bodies passing through this function carry the
 * sponsor's re-edit token and the email-change confirmation link, either of
 * which is a working credential in a log line. The caller knows which message
 * it queued and can say so without quoting it; this module knows only the
 * bytes.
 */

/**
 * The refusals that will still refuse on the next attempt.
 *
 * The list is of *permanent* failures rather than transient ones, so that
 * anything unrecognised defers. That direction is deliberate: the queue
 * (`jobs/index.ts`) bounds the number of attempts, so treating an unknown
 * failure as transient costs a handful of retries, while treating it as
 * permanent drops a message for good on the strength of a code nobody has seen
 * before.
 *
 * From Cloudflare's own error table:
 *
 * | code | why it is permanent |
 * |---|---|
 * | `E_RECIPIENT_NOT_ALLOWED` | the address is not on the binding's allowlist — and this app sets no allowlist, so seeing it means the configuration changed under us |
 * | `E_RECIPIENT_SUPPRESSED` | the recipient bounced or complained before; retrying is how a sender loses its domain reputation |
 * | `E_VALIDATION_ERROR` | the address is not a valid address |
 * | `E_TOO_MANY_RECIPIENTS` | more than fifty; the same message will have the same number next time |
 * | `E_CONTENT_TOO_LARGE` | over the size limit; likewise |
 * | `E_SENDER_NOT_VERIFIED` | the sender domain is not verified |
 * | `E_SENDER_DOMAIN_NOT_AVAILABLE` | the domain is not onboarded to Email Service |
 *
 * The last two are the pair a sending domain that is not yet set up produces,
 * and they are the uncomfortable entries: they are an operator's
 * misconfiguration rather than anything about the recipient, and classing them
 * permanent means a queue drains into the failure log while the DNS record is
 * missing. That is still the better trade. Retrying them changes nothing until
 * a human acts, and a queue that retries every message for ever is how
 * the *next* misconfiguration goes unnoticed. The queue records the reason it
 * gave up, which is what makes the failure visible.
 */
const PERMANENT_REFUSALS = new Set([
  "E_CONTENT_TOO_LARGE",
  "E_RECIPIENT_NOT_ALLOWED",
  "E_RECIPIENT_SUPPRESSED",
  "E_SENDER_DOMAIN_NOT_AVAILABLE",
  "E_SENDER_NOT_VERIFIED",
  "E_TOO_MANY_RECIPIENTS",
  "E_VALIDATION_ERROR",
]);

/**
 * A send that did not happen, and whether trying again could change that.
 *
 * `retryable` is the whole point of the class. A quota refusal
 * (`E_DAILY_LIMIT_EXCEEDED`) and a rejected recipient arrive at this function
 * as the same kind of `Error` and differ only in `code`; collapsing them into
 * "sending failed" is what produces either a reminder nobody was ever asked
 * for or a queue that never drains.
 *
 * Deliberately not exported, even though the queue has a retry policy.
 * `isRetryableSendFailure` below is what that policy asks, and it answers for
 * a raw refusal as readily as for one of these — so the queue never has to
 * know which shape it caught, and knip has nothing exported that nothing
 * imports. The two fields are readable from the instance either way, which is
 * how `adapter.test.ts` asserts on them.
 *
 * `retryable` is computed rather than passed in. It was a constructor
 * argument until the policy needed the same question answered somewhere else;
 * one function answering it for both is what stops a wrapped failure and a
 * raw one being classified by two lists that can disagree.
 */
class EmailSendFailure extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, cause: unknown) {
    super(
      code === ""
        ? "The email binding refused the message."
        : `The email binding refused the message: ${code}.`,
      { cause }
    );
    this.name = "EmailSendFailure";
    this.code = code;
    this.retryable = isRetryableSendFailure(this);
  }
}

/**
 * Whether trying this send again could produce a different answer.
 *
 * Exported because the classification and the *policy built on it* belong in
 * different places: this module knows what Cloudflare's codes mean, and
 * `jobs/index.ts` knows what to do about it — defer, or stop and record why.
 * Duplicating the set there would be two lists to keep in step, and the one
 * that fell behind would be the one that decides whether mail is dropped.
 *
 * It takes `unknown` and reads the code off whatever it is given, which makes
 * it true of both shapes the same refusal wears: the raw error the binding
 * throws, and the {@link EmailSendFailure} this module wraps it in. A caller
 * cannot get the wrong answer by asking about the wrong one.
 *
 * Anything unrecognised — including an error with no code at all, which is
 * what a network fault looks like — is retryable. See {@link
 * PERMANENT_REFUSALS} for why that direction and not the other.
 */
export function isRetryableSendFailure(error: unknown): boolean {
  return !PERMANENT_REFUSALS.has(codeOf(error));
}

/** Cloudflare puts its error table's code on the thrown error's `code`. */
function codeOf(error: unknown): string {
  if (error !== null && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;

    return typeof code === "string" ? code : "";
  }

  return "";
}

/**
 * Nodemailer's `{ name, address }` as Cloudflare's `{ name, email }`.
 *
 * A plain string is left exactly as it is: both APIs accept one, and both
 * accept `"Name <a@b>"` inside it, so rewriting it could only lose something.
 */
type NodemailerAddress = NonNullable<SendEmailOptions["from"]>;

function asAddress(value: NodemailerAddress): EmailAddress | string {
  if (typeof value === "string") {
    return value;
  }

  return value.name === ""
    ? value.address
    : { email: value.address, name: value.name };
}

function asRecipients(
  value: SendEmailOptions["to"]
): (EmailAddress | string)[] | EmailAddress | string {
  if (value === undefined) {
    // Cloudflare requires at least one of `to`, `cc` or `bcc`; an empty string
    // is refused by the binding rather than silently delivered somewhere.
    return "";
  }

  return Array.isArray(value) ? value.map(asAddress) : asAddress(value);
}

/** Bodies nodemailer types as `Buffer | Readable | string` are only used here as strings. */
function asBody(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

interface CloudflareEmailAdapterOptions {
  /**
   * The binding, resolved at the moment of sending.
   *
   * A thunk rather than the binding itself, so that nothing about email is
   * evaluated while a module is being imported or a build is collecting route
   * configuration.
   */
  binding: () => SendEmail | undefined;
  defaultFromAddress: string;
  defaultFromName: string;
}

export function cloudflareEmailAdapter({
  binding,
  defaultFromAddress,
  defaultFromName,
}: CloudflareEmailAdapterOptions): PayloadEmailAdapter<EmailSendResult> {
  return () => ({
    defaultFromAddress,
    defaultFromName,
    name: "cloudflare-send-email",
    sendEmail: async (message: SendEmailOptions): Promise<EmailSendResult> => {
      const send = requireBinding(binding(), "EMAIL");

      const builder: EmailMessageBuilder = {
        from:
          message.from === undefined
            ? { email: defaultFromAddress, name: defaultFromName }
            : asAddress(message.from),
        subject: message.subject ?? "",
        to: asRecipients(message.to),
      };

      const text = asBody(message.text);
      const html = asBody(message.html);

      if (text !== undefined) {
        builder.text = text;
      }

      if (html !== undefined) {
        builder.html = html;
      }

      try {
        // No timeout on this call, unlike every other outbound call in this
        // application. A binding call cannot be given an `AbortSignal` and
        // aborting it does not stop the send — it would only stop this
        // Worker from waiting for the answer, which turns a slow send into a
        // duplicate once the caller (or a retry) tries again. So a send that
        // never returns is left running, and `jobs/reapStrandedJobs.ts` is
        // the backstop: it reclaims the job that never got a callback rather
        // than racing the send itself.
        return await send.send(builder);
      } catch (error) {
        throw new EmailSendFailure(codeOf(error), error);
      }
    },
  });
}
