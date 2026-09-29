import type { Locale } from "@smog/i18n";
import {
  type EmailTemplateId,
  type EmailTemplateProps,
  renderEmail,
} from "./render";
import type { EmailSender } from "./sender";

export interface SendEmailInput<Id extends EmailTemplateId> {
  from: string;
  locale: Locale;
  props: EmailTemplateProps[Id];
  replyTo?: string | undefined;
  template: Id;
  to: string;
}

/**
 * Renders and sends one email. Every email goes through here, so moving to
 * the email queue later changes only this function.
 */
export async function sendEmail<Id extends EmailTemplateId>(
  sender: EmailSender,
  input: SendEmailInput<Id>
): Promise<void> {
  try {
    // phase 6: enqueue on EMAIL_QUEUE instead of sending inline.
    const rendered = await renderEmail(
      input.template,
      input.props,
      input.locale
    );
    await sender.send({
      from: input.from,
      ...rendered,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      to: input.to,
    });
  } catch (error) {
    console.error(`[email] Failed to send ${input.template}:`, error);
    throw error;
  }
}
