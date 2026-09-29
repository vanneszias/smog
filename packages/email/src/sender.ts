import type { Environment } from "@smog/config/env/worker";

/** One outgoing email. `from`/`replyTo` may be `Name <address>`. */
export interface EmailMessage {
  from: string;
  html: string;
  replyTo?: string;
  subject: string;
  text: string;
  to: string;
}

export interface EmailSender {
  send: (message: EmailMessage) => Promise<void>;
}

/** The part of the `send_email` binding (`SendEmail`) the sender uses. */
type SendEmailBinding = Pick<SendEmail, "send">;

/** `SMOG & Co <noreply@x>` → `{ name, email }`; a bare address stays a string. */
function toAddress(value: string): string | EmailAddress {
  const trimmed = value.trim();
  const open = trimmed.lastIndexOf("<");
  if (open === -1 || !trimmed.endsWith(">")) {
    return trimmed;
  }
  const email = trimmed.slice(open + 1, -1).trim();
  const name = trimmed.slice(0, open).trim().replaceAll('"', "");
  return name ? { email, name } : email;
}

/** Sends through Cloudflare Email Service (the `send_email` binding `EMAIL`). */
export class CloudflareEmailSender implements EmailSender {
  readonly #binding: SendEmailBinding;

  constructor(binding: SendEmailBinding) {
    this.#binding = binding;
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.#binding.send({
        from: toAddress(message.from),
        html: message.html,
        ...(message.replyTo ? { replyTo: toAddress(message.replyTo) } : {}),
        subject: message.subject,
        text: message.text,
        to: message.to,
      });
    } catch (error) {
      console.error("[email] Failed to send through the EMAIL binding:", error);
      throw error;
    }
  }
}

/** Keeps every message in memory (tests). */
export class MemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

/** The KV key of the dev mailbox (`/dev/mail`). */
export const DEV_MAIL_KEY = "dev:mail";
/** How many messages the dev mailbox keeps. */
export const DEV_MAIL_LIMIT = 50;

export interface StoredEmail extends EmailMessage {
  /** Epoch ms. */
  sentAt: number;
}

type DevMailKv = Pick<KVNamespace, "get" | "put">;

/** The dev mailbox, newest first. */
export async function readDevMail(kv: DevMailKv): Promise<StoredEmail[]> {
  const stored = await kv.get<StoredEmail[]>(DEV_MAIL_KEY, "json");
  return Array.isArray(stored) ? stored : [];
}

/**
 * Local development: logs the message and prepends it to the KV list
 * `dev:mail` (the latest 50), which `/dev/mail` shows. Nothing is sent.
 */
export class DevEmailSender implements EmailSender {
  readonly #kv: DevMailKv;

  constructor(kv: DevMailKv) {
    this.#kv = kv;
  }

  async send(message: EmailMessage): Promise<void> {
    console.log(`[email] ${message.to}: ${message.subject}\n${message.text}`);
    try {
      const mail = await readDevMail(this.#kv);
      const next = [{ ...message, sentAt: Date.now() }, ...mail].slice(
        0,
        DEV_MAIL_LIMIT
      );
      await this.#kv.put(DEV_MAIL_KEY, JSON.stringify(next));
    } catch (error) {
      console.error("[email] Failed to store dev mail:", error);
      throw error;
    }
  }
}

export interface EmailSenderOptions {
  /** The `send_email` binding `EMAIL` (staging and production). */
  binding?: SendEmailBinding | undefined;
  environment: Environment;
  kv: DevMailKv;
}

/** dev → DevEmailSender (KV mailbox); staging/production → Email Service. */
export function createEmailSender(options: EmailSenderOptions): EmailSender {
  if (options.environment === "dev") {
    return new DevEmailSender(options.kv);
  }
  if (!options.binding) {
    throw new Error(
      `[email] Failed to create a sender: the EMAIL binding is missing in ${options.environment}`
    );
  }
  return new CloudflareEmailSender(options.binding);
}
