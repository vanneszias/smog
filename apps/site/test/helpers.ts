import { env, exports } from "cloudflare:workers";
import { readDevMail, type StoredEmail } from "@smog/email";

export const ORIGIN = "http://localhost:5173";

type DevMailMessage = StoredEmail;

/**
 * The dev mailbox now (what `/dev/mail.json` shows), read from KV so it
 * works while maintenance answers `/dev/*` with a 503.
 */
async function readMailbox(): Promise<DevMailMessage[]> {
  if (!env.KV) {
    throw new Error("[test] The KV binding is missing");
  }
  return await readDevMail(env.KV);
}

/** The dev mailbox's messages to one address, now (no waiting). */
export async function mailTo(email: string): Promise<DevMailMessage[]> {
  return (await readMailbox()).filter((message) => message.to === email);
}

/**
 * Waits until the dev mailbox has a message to `email` (that `match`
 * accepts) and returns every such message. Auth emails are queued during
 * the request, then rendered and sent by the email queue's consumer, and a
 * React Email render can take seconds under load, so this polls against a
 * deadline (in workerd `Date.now()` advances across I/O) and, on timeout,
 * throws with what the mailbox held.
 */
export async function waitForMail(
  email: string,
  {
    match = () => true,
    timeoutMs = 15_000,
  }: { match?: (message: DevMailMessage) => boolean; timeoutMs?: number } = {}
): Promise<DevMailMessage[]> {
  const deadline = Date.now() + timeoutMs;
  let last: DevMailMessage[] = [];
  while (Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: polling until the background send lands.
    last = await readMailbox();
    const found = last.filter(
      (message) => message.to === email && match(message)
    );
    if (found.length > 0) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const held = last.map((message) => `${message.to}: ${message.subject}`);
  throw new Error(
    `[test] No email to ${email} within ${timeoutMs} ms; the mailbox held: ${JSON.stringify(held)}`
  );
}

const VERIFY_LINK =
  /http:\/\/localhost:5173\/api\/auth\/verify-email\?token=\S+/;

/**
 * Signs up by email (plus `extra` sign-up fields), follows the
 * verification link and returns the session cookie header and the email.
 */
export async function signedUp(
  extra: Record<string, unknown> = {}
): Promise<{ cookie: string; email: string }> {
  const email = `${crypto.randomUUID()}@smog.test`;
  const signUp = await exports.default.fetch(
    `${ORIGIN}/api/auth/sign-up/email`,
    {
      body: JSON.stringify({
        email,
        name: "A",
        password: "correct horse battery",
        ...extra,
      }),
      headers: {
        "cf-connecting-ip": `198.51.100.${crypto.randomUUID()}`,
        "content-type": "application/json",
        origin: ORIGIN,
      },
      method: "POST",
    }
  );
  if (signUp.status !== 200) {
    throw new Error(`[test] Sign-up answered ${signUp.status}`);
  }
  const [message] = await waitForMail(email, {
    match: ({ text }) => VERIFY_LINK.test(text),
  });
  const link = message?.text.match(VERIFY_LINK)?.[0] ?? "";
  const verified = await exports.default.fetch(link, { redirect: "manual" });
  const cookie = verified.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  // Verifying queues the welcome email (in the account's language): wait
  // for it, so a test that counts this address's mail later starts from a
  // settled mailbox.
  await waitForMail(email, { match: ({ text }) => !VERIFY_LINK.test(text) });
  return { cookie, email };
}
