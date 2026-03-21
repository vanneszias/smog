/**
 * Email Service
 *
 * Nodemailer transporter setup and core sendEmail helper.
 * All outbound email goes through this module.
 */

import type { Transporter } from "nodemailer";
import nodemailer from "nodemailer";

// =============================================================================
// Transporter
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
    console.warn(
      "[Email] SMTP credentials not fully configured – emails will be logged to console only"
    );
    // Create an Ethereal / stub transporter so the rest of the code still works
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

  try {
    const info = await transporter.sendMail({
      from,
      replyTo,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    // When using jsonTransport (no SMTP configured) the message is just logged
    if (info.messageId) {
      console.log(
        `[Email] Sent "${options.subject}" to ${options.to} (id: ${info.messageId})`
      );
    }
  } catch (error) {
    console.error(
      `[Email] Failed to send "${options.subject}" to ${options.to}:`,
      error
    );
    throw error;
  }
}
