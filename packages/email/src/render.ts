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
import {
  type WeMovedProps,
  weMoved,
} from "./templates/transactional/we-moved";
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
  "transactional/we-moved": WeMovedProps;
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
  "transactional/we-moved": weMoved,
  "transactional/welcome": welcome,
};

export interface RenderedEmail {
  html: string;
  subject: string;
  text: string;
}

export interface RenderOptions {
  /** The site origin (`SITE_URL`): the header logo is loaded from it. */
  siteUrl?: string | undefined;
}

/**
 * A template could not be rendered from its props (a missing or malformed
 * prop, a non-http link): a producer bug or version skew, and a failed
 * send is not this. The email consumer retries it like a failed send, so
 * after the retries the DLQ keeps the message for a replay once fixed.
 */
export class EmailRenderError extends Error {
  override name = "EmailRenderError";
}

/** After a details label in the plain text ("Gesture: Hond"); French spaces the colon. */
const LABEL_SEPARATOR: Record<Locale, string> = {
  en: ": ",
  fr: " : ",
  nl: ": ",
};

/**
 * html-to-text runs table cells together ("GestureHond"), so a details
 * label (`data-email-label`, `DetailsBox`) gets a colon in the plain text;
 * the HTML lines the cells up in columns instead.
 */
function plainTextOptions(locale: Locale) {
  return {
    formatters: {
      emailLabel: (
        element: { children: unknown[] },
        walk: (nodes: unknown[], builder: never) => void,
        builder: { addInline: (text: string) => void }
      ) => {
        walk(element.children, builder as never);
        builder.addInline(LABEL_SEPARATOR[locale]);
      },
    },
    selectors: [{ format: "emailLabel", selector: "td[data-email-label]" }],
  };
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
 * HTML by string concatenation. Any failure is an `EmailRenderError`.
 */
export async function renderEmail<Id extends EmailTemplateId>(
  template: Id,
  props: EmailTemplateProps[Id],
  locale: Locale,
  options: RenderOptions = {}
): Promise<RenderedEmail> {
  try {
    assertLinks(props);
    const context = {
      locale,
      siteUrl: options.siteUrl,
      t: createI18n(locale).t,
    };
    const definition: EmailTemplate<EmailTemplateProps[Id]> =
      TEMPLATES[template];
    const element = definition.render(props, context);
    const [html, text] = await Promise.all([
      render(element),
      render(element, {
        htmlToTextOptions: plainTextOptions(locale),
        plainText: true,
      }),
    ]);
    return { html, subject: definition.subject(props, context), text };
  } catch (error) {
    throw new EmailRenderError(
      error instanceof Error ? error.message : String(error),
      { cause: error }
    );
  }
}
