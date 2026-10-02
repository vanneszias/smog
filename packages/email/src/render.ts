import { createI18n, type Locale } from "@smog/i18n";
import { render } from "react-email";
import { type MagicLinkProps, magicLink } from "./templates/auth/magic-link";
import { type OtpProps, otp } from "./templates/auth/otp";
import {
  type ResetPasswordProps,
  resetPassword,
} from "./templates/auth/reset-password";
import {
  type VerifyEmailProps,
  verifyEmail,
} from "./templates/auth/verify-email";
import {
  type AdminNewSponsorshipProps,
  adminNewSponsorship,
} from "./templates/transactional/admin-new-sponsorship";
import {
  type AdminRefundNeededProps,
  adminRefundNeeded,
} from "./templates/transactional/admin-refund-needed";
import {
  type AdminRenderFailedProps,
  adminRenderFailed,
} from "./templates/transactional/admin-render-failed";
import {
  type PaymentConfirmedProps,
  paymentConfirmed,
} from "./templates/transactional/payment-confirmed";
import {
  type RenewalReminderProps,
  renewalReminder,
} from "./templates/transactional/renewal-reminder";
import {
  type SponsorshipLiveProps,
  sponsorshipLive,
} from "./templates/transactional/sponsorship-live";
import {
  type SponsorshipReceivedProps,
  sponsorshipReceived,
} from "./templates/transactional/sponsorship-received";
import { type WelcomeProps, welcome } from "./templates/transactional/welcome";
import type { EmailTemplate } from "./templates/types";

/** Every template and its props. */
export interface EmailTemplateProps {
  "auth/magic-link": MagicLinkProps;
  "auth/otp": OtpProps;
  "auth/reset-password": ResetPasswordProps;
  "auth/verify-email": VerifyEmailProps;
  "transactional/admin-new-sponsorship": AdminNewSponsorshipProps;
  "transactional/admin-refund-needed": AdminRefundNeededProps;
  "transactional/admin-render-failed": AdminRenderFailedProps;
  "transactional/payment-confirmed": PaymentConfirmedProps;
  "transactional/renewal-reminder": RenewalReminderProps;
  "transactional/sponsorship-live": SponsorshipLiveProps;
  "transactional/sponsorship-received": SponsorshipReceivedProps;
  "transactional/welcome": WelcomeProps;
}

export type EmailTemplateId = keyof EmailTemplateProps;

const TEMPLATES: {
  [Id in EmailTemplateId]: EmailTemplate<EmailTemplateProps[Id]>;
} = {
  "auth/magic-link": magicLink,
  "auth/otp": otp,
  "auth/reset-password": resetPassword,
  "auth/verify-email": verifyEmail,
  "transactional/admin-new-sponsorship": adminNewSponsorship,
  "transactional/admin-refund-needed": adminRefundNeeded,
  "transactional/admin-render-failed": adminRenderFailed,
  "transactional/payment-confirmed": paymentConfirmed,
  "transactional/renewal-reminder": renewalReminder,
  "transactional/sponsorship-live": sponsorshipLive,
  "transactional/sponsorship-received": sponsorshipReceived,
  "transactional/welcome": welcome,
};

export interface RenderedEmail {
  html: string;
  subject: string;
  text: string;
}

function assertLinks(props: object): void {
  if ("url" in props && typeof props.url === "string") {
    const { protocol } = new URL(props.url);
    if (protocol !== "https:" && protocol !== "http:") {
      throw new Error(
        `[email] Failed to render: url must be http(s), got ${protocol}`
      );
    }
  }
}

/**
 * Renders a template in `locale`. The body goes through React Email JSX, so
 * interpolated user data (names, addresses) is HTML-escaped even though the
 * i18n instance does not escape (`escapeValue: false`). Never build the
 * HTML by string concatenation.
 */
export async function renderEmail<Id extends EmailTemplateId>(
  template: Id,
  props: EmailTemplateProps[Id],
  locale: Locale
): Promise<RenderedEmail> {
  assertLinks(props);
  const context = { locale, t: createI18n(locale).t };
  const definition: EmailTemplate<EmailTemplateProps[Id]> = TEMPLATES[template];
  const element = definition.render(props, context);
  try {
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);
    return { html, subject: definition.subject(props, context), text };
  } catch (error) {
    console.error(`[email] Failed to render ${template}:`, error);
    throw error;
  }
}
