// @vitest-environment node
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Payload } from "payload";
import { describe, expect, it } from "vitest";
import { experimental_readRawConfig } from "wrangler";
import { cloudflareEmailAdapter } from "./adapter";

/**
 * Stand-ins. Nothing in this file reaches Cloudflare: every send goes to a
 * fake binding held in memory, and the one test that touches a real file
 * reads `wrangler.jsonc` off disk without booting anything.
 *
 * The addresses use `.test`, which RFC 2606 reserves precisely so that a
 * fixture cannot be mistaken for — or accidentally delivered to — a real
 * mailbox.
 */
const FROM_ADDRESS = "no-reply@example.test";
const FROM_NAME = "Smog";
const RECIPIENT = "sponsor@example.test";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const WRANGLER_CONFIG = path.resolve(dirname, "..", "..", "wrangler.jsonc");

/**
 * The binding restrictions a `send_email` entry may carry, all four of them.
 *
 * The obvious one is `allowed_destination_addresses`. Cloudflare's own
 * "Configure send bindings" page lists two more that silently narrow where
 * mail can go, and one that narrows where it can come from:
 *
 * - `destination_address` — a *single* permitted recipient, and worse than
 *   the allowlist: "If you call `send()` with `to` set to `null` or
 *   `undefined`, the configured address is used", so it can also redirect.
 * - `allowed_destination_addresses` — the destination allowlist.
 * - `allowed_sender_addresses` — restricts the `from`.
 *
 * With none of them present the binding "can send to any verified destination
 * address in your account", and once a sending domain is onboarded,
 * to any recipient at all. That is what transactional mail needs, so the
 * assertion is the strong one: the entry carries its `name` and nothing else.
 */
const RESTRICTION_KEYS = [
  "destination_address",
  "allowed_destination_addresses",
  "allowed_sender_addresses",
] as const;

type SentMessage = EmailMessageBuilder;

/** A binding that records what it was handed and never sends anything. */
function recordingBinding(): { binding: SendEmail; sent: SentMessage[] } {
  const sent: SentMessage[] = [];

  return {
    sent,
    binding: {
      send: (message: EmailMessage | SentMessage) => {
        sent.push(message as SentMessage);

        return Promise.resolve({ messageId: `stub-${sent.length}` });
      },
    } as SendEmail,
  };
}

/** A binding whose every send fails with `error`. */
function failingBinding(error: unknown): SendEmail {
  return { send: () => Promise.reject(error) } as SendEmail;
}

/**
 * A refusal shaped the way Cloudflare's Email Service shapes one: an `Error`
 * carrying a `code` alongside its message.
 */
function refusal(code: string): Error {
  return Object.assign(new Error(`refused: ${code}`), { code });
}

function adapterFor(binding: () => SendEmail | undefined) {
  return cloudflareEmailAdapter({
    binding,
    defaultFromAddress: FROM_ADDRESS,
    defaultFromName: FROM_NAME,
  })({ payload: {} as Payload });
}

/**
 * The reason a send failed, as an object rather than a thrown control flow.
 *
 * Written with `.then(ok, err)` deliberately. Wrapping an `expect.unreachable()`
 * in a `try`/`catch` puts the assertion's own failure into the `catch`, where
 * the rest of the test happily asserts against it — a test that can no longer
 * fail. This form has nowhere for that to hide: the success branch throws an
 * error the failure branch never sees.
 */
function failureOf(send: Promise<unknown>): Promise<unknown> {
  return send.then(
    () => {
      throw new Error("the send resolved; it was supposed to fail");
    },
    (error: unknown) => error
  );
}

describe("the Cloudflare email adapter", () => {
  it("sends a message through the binding", async () => {
    const { binding, sent } = recordingBinding();

    const result = await adapterFor(() => binding).sendEmail({
      subject: "Your re-edit link",
      text: "Open the link to change your video.",
      to: RECIPIENT,
    });

    expect(sent).toHaveLength(1);
    expect(result).toEqual({ messageId: "stub-1" });
  });

  it("passes the sender, recipient, subject and body through unchanged", async () => {
    const { binding, sent } = recordingBinding();

    await adapterFor(() => binding).sendEmail({
      from: "billing@example.test",
      html: "<p>Open the link to change your video.</p>",
      subject: "Your re-edit link",
      text: "Open the link to change your video.",
      to: RECIPIENT,
    });

    expect(sent[0]).toEqual({
      from: "billing@example.test",
      html: "<p>Open the link to change your video.</p>",
      subject: "Your re-edit link",
      text: "Open the link to change your video.",
      to: RECIPIENT,
    });
  });

  it("falls back to the configured sender when the message names none", async () => {
    const { binding, sent } = recordingBinding();

    await adapterFor(() => binding).sendEmail({
      subject: "Confirm your new address",
      text: "Confirm.",
      to: RECIPIENT,
    });

    expect(sent[0]?.from).toEqual({ email: FROM_ADDRESS, name: FROM_NAME });
  });

  it("builds a message the binding accepts, without constructing MIME", async () => {
    // Cloudflare's Email Service binding takes a structured builder —
    // `send(builder: EmailMessageBuilder)` — and composes the MIME itself.
    // The raw-MIME overload, `send(message: EmailMessage)`, belongs to Email
    // Routing and needs `EmailMessage` from `cloudflare:email`, a module that
    // exists only inside workerd: importing it would break `next build` and
    // every test in this suite. So the assertion is both halves — the shape
    // the binding is given, and the shape it is not.
    const { binding, sent } = recordingBinding();

    await adapterFor(() => binding).sendEmail({
      subject: "Your re-edit link",
      text: "Open the link.",
      to: { address: RECIPIENT, name: "A Sponsor" },
    });

    const message = sent[0];

    expect(message).not.toHaveProperty("raw");
    expect(Object.keys(message ?? {}).sort()).toEqual([
      "from",
      "subject",
      "text",
      "to",
    ]);
    // Nodemailer's `{ name, address }` is not Cloudflare's `{ name, email }`,
    // and a recipient that survives as the wrong shape is mail nobody gets.
    expect(message?.to).toEqual({ email: RECIPIENT, name: "A Sponsor" });
  });

  it("reports a send failure to the caller rather than swallowing it", async () => {
    const underlying = new Error("no route to host");
    const adapter = adapterFor(() => failingBinding(underlying));

    const failure = await failureOf(
      adapter.sendEmail({ subject: "s", text: "t", to: RECIPIENT })
    );

    // Rejected, not resolved with a made-up success — `failureOf` throws if
    // the send resolves at all.
    expect(failure).toBeInstanceOf(Error);
    // And the original is still reachable, so "sending failed" never replaces
    // what actually went wrong.
    expect((failure as Error).cause).toBe(underlying);
  });

  it("fails when the binding is not configured at all", async () => {
    // The positive beside the negative below: reading the binding late is only
    // safe because a missing one still fails loudly on the send that needed it.
    const adapter = adapterFor(() => undefined);

    await expect(
      adapter.sendEmail({ subject: "s", text: "t", to: RECIPIENT })
    ).rejects.toThrow(/EMAIL/);
  });

  it("does not configure allowed_destination_addresses", () => {
    // Cloudflare's E_RECIPIENT_NOT_ALLOWED fires only when that list is set.
    // Setting it silently drops mail to every address not on it — which for
    // transactional mail is every sponsor and every user.
    const { rawConfig } = experimental_readRawConfig({
      config: WRANGLER_CONFIG,
    });

    // `send_email` "is not automatically inherited from the top level
    // environment, and so must be specified in every named environment"
    // (wrangler's own config schema). A top-level-only binding would leave
    // both deployed Workers with no way to send at all, so every environment
    // is checked and the set of environments is pinned.
    const environments = Object.entries(
      (rawConfig.env ?? {}) as Record<
        string,
        { send_email?: Record<string, unknown>[] }
      >
    );

    expect(environments.map(([name]) => name).sort()).toEqual([
      "production",
      "staging",
    ]);

    for (const [name, environment] of environments) {
      const bindings = environment.send_email ?? [];

      expect(bindings, `${name} has no send_email binding`).toHaveLength(1);

      for (const key of RESTRICTION_KEYS) {
        expect(bindings[0], `${name}.send_email[0]`).not.toHaveProperty(key);
      }

      expect(Object.keys(bindings[0] ?? {})).toEqual(["name"]);
    }
  });

  it("reads the binding per call, not at module scope", () => {
    // `createMollieClient({apiKey:""})` threw in its constructor and killed a
    // whole `next build` from a file that had nothing to do with payments.
    let reads = 0;
    const binding = () => {
      reads += 1;

      return recordingBinding().binding;
    };

    const adapter = cloudflareEmailAdapter({
      binding,
      defaultFromAddress: FROM_ADDRESS,
      defaultFromName: FROM_NAME,
    })({ payload: {} as Payload });

    // Nothing has been sent, so nothing has been resolved.
    expect(reads).toBe(0);

    return Promise.all([
      adapter.sendEmail({ subject: "s", text: "t", to: RECIPIENT }),
      adapter.sendEmail({ subject: "s", text: "t", to: RECIPIENT }),
    ]).then(() => {
      // One resolution per send, not one for the life of the adapter.
      expect(reads).toBe(2);
    });
  });

  it("answers a quota refusal differently from a bad address", async () => {
    // E_DAILY_LIMIT_EXCEEDED must defer; a rejected recipient must stop.
    // The queue's retry policy is built on this distinction.
    const send = (code: string) =>
      failureOf(
        adapterFor(() => failingBinding(refusal(code))).sendEmail({
          subject: "s",
          text: "t",
          to: RECIPIENT,
        })
      );

    expect(await send("E_DAILY_LIMIT_EXCEEDED")).toMatchObject({
      code: "E_DAILY_LIMIT_EXCEEDED",
      retryable: true,
    });
    expect(await send("E_RATE_LIMIT_EXCEEDED")).toMatchObject({
      code: "E_RATE_LIMIT_EXCEEDED",
      retryable: true,
    });
    expect(await send("E_RECIPIENT_NOT_ALLOWED")).toMatchObject({
      code: "E_RECIPIENT_NOT_ALLOWED",
      retryable: false,
    });
    expect(await send("E_VALIDATION_ERROR")).toMatchObject({
      code: "E_VALIDATION_ERROR",
      retryable: false,
    });
  });

  it("defers a failure it cannot classify", async () => {
    // An unrecognised code, and no code at all, say nothing about the
    // recipient. Retrying a bounded number of times costs a little; treating
    // an outage as permanent drops the message for good.
    const unknown = await failureOf(
      adapterFor(() => failingBinding(refusal("E_SOMETHING_NEW"))).sendEmail({
        subject: "s",
        text: "t",
        to: RECIPIENT,
      })
    );
    const bare = await failureOf(
      adapterFor(() => failingBinding(new Error("socket hang up"))).sendEmail({
        subject: "s",
        text: "t",
        to: RECIPIENT,
      })
    );

    expect(unknown).toMatchObject({ code: "E_SOMETHING_NEW", retryable: true });
    expect(bare).toMatchObject({ code: "", retryable: true });
  });
});
