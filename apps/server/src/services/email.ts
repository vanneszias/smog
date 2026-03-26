/**
 * Email Service
 *
 * Nodemailer transporter setup and core sendEmail helper.
 * After each successful SMTP send the raw RFC 822 message is appended
 * to the IMAP Sent folder so it appears in SOGo / mailcow webmail.
 */

import { createRequire } from "node:module";
import { createLogger } from "@smog/shared/logger";
import { ImapFlow } from "imapflow";
import type { Transporter } from "nodemailer";
import nodemailer from "nodemailer";

const logger = createLogger("emailService");

// MailComposer is a CJS internal of nodemailer — use createRequire to reach it
const _require = createRequire(import.meta.url);
// biome-ignore lint/suspicious/noExplicitAny: CJS interop
const MailComposer: new (options: nodemailer.SendMailOptions) => any = _require(
  "nodemailer/lib/mail-composer"
);

// =============================================================================
// Transporter (SMTP)
// =============================================================================

let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (_transporter) {
    return _transporter;
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!(host && user && pass)) {
    logger.warn(
      "SMTP credentials not fully configured – emails will be logged to console only"
    );
    _transporter = nodemailer.createTransport({ jsonTransport: true });
    return _transporter;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return _transporter;
}

// =============================================================================
// IMAP – append to Sent folder
// =============================================================================

/**
 * Build a raw RFC 822 buffer from the same mail options we pass to sendMail.
 * Uses nodemailer's internal MailComposer so the bytes match what was delivered.
 */
async function buildRawMessage(
  mailOptions: nodemailer.SendMailOptions
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const composer = new MailComposer(mailOptions);
    const stream: NodeJS.ReadableStream = composer.compile().createReadStream();
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer | string) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    );
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

/**
 * Open an IMAP connection and append `rawMessage` to the Sent folder.
 * On any failure this logs a warning and returns – the email was already
 * delivered so we never want to throw here.
 */
async function appendToSentFolder(rawMessage: Buffer): Promise<void> {
  // IMAP config – defaults to the same host/credentials as SMTP (mailcow reuses them)
  const host = process.env.IMAP_HOST ?? process.env.SMTP_HOST;
  const port = Number(process.env.IMAP_PORT ?? 993);
  const user = process.env.IMAP_USER ?? process.env.SMTP_USER;
  const pass = process.env.IMAP_PASS ?? process.env.SMTP_PASS;
  const sentFolder = process.env.IMAP_SENT_FOLDER ?? "Sent";

  if (!(host && user && pass)) {
    logger.warn(
      "IMAP credentials not configured – skipping Sent folder append"
    );
    return;
  }

  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();

    // Ensure the Sent folder exists (mailcow creates it by default, but just in case)
    try {
      await client.mailboxOpen(sentFolder, { readOnly: false });
    } catch {
      await client.mailboxCreate(sentFolder);
      await client.mailboxOpen(sentFolder, { readOnly: false });
    }

    await client.append(sentFolder, rawMessage, ["\\Seen"], new Date());
    logger.info(`Appended message to IMAP "${sentFolder}" folder`);
  } catch (error) {
    logger.warn("Could not append to IMAP Sent folder", error);
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore logout errors
    }
  }
}

// =============================================================================
// Core send helper
// =============================================================================

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const from = process.env.SMTP_FROM ?? "Smog <no-reply@smog.app>";
  const replyTo = process.env.SMTP_REPLY_TO ?? "info@smog.vlaanderen";
  const transporter = getTransporter();

  const mailOptions: nodemailer.SendMailOptions = {
    from,
    replyTo,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  };

  try {
    const info = await transporter.sendMail(mailOptions);

    if (info.messageId) {
      logger.info(
        `Sent "${options.subject}" to ${options.to} (id: ${info.messageId})`
      );
    }
  } catch (error) {
    logger.error(`Failed to send "${options.subject}" to ${options.to}`, error);
    throw error;
  }

  // Append to IMAP Sent folder — fire-and-forget, never blocks delivery
  const isRealSmtp = !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );

  if (isRealSmtp) {
    buildRawMessage(mailOptions)
      .then((raw) => appendToSentFolder(raw))
      .catch((err) => {
        logger.warn("Failed to build/append raw message", err);
      });
  }
}
