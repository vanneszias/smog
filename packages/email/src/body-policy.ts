/**
 * Which emails a dead letter may keep the body of (phase 9 ruling 5c).
 * The DLQ consumer stores a failed email's `to` and `props` so an admin can
 * replay it; an email whose props hold a secret (a code, a sign-in, reset
 * or verification link, a sponsorship token in a link) is stored with no
 * body at all and is not replayable, because a stored secret is a
 * credential at rest for as long as the row lives.
 *
 * `EMAIL_BODY_CLASS` is a mapped type over every template: a new template
 * does not compile until it is classified, and `test/body-policy.test.ts`
 * holds each class to what the template's sample props take:
 * - `secret`: a code, a token, or a link with one (never stored);
 * - `link`: a `url` prop that was reviewed and is a public or admin page,
 *   with no secret in it (stored);
 * - `none`: no `url`, `token` or `code` prop (stored).
 */
import type { EmailTemplateId } from "./samples";

export type EmailBodyClass = "link" | "none" | "secret";

export const EMAIL_BODY_CLASS: {
  readonly [Id in EmailTemplateId]: EmailBodyClass;
} = {
  "auth/magic-link": "secret",
  "auth/otp": "secret",
  "auth/reset-password": "secret",
  "auth/verify-email": "secret",
  "transactional/admin-dead-letter": "link",
  "transactional/admin-new-sponsorship": "link",
  "transactional/admin-refund-needed": "link",
  "transactional/admin-render-failed": "link",
  "transactional/payment-confirmed": "none",
  // The renewal link carries the raw sponsorship token.
  "transactional/renewal-reminder": "secret",
  "transactional/sponsorship-live": "link",
  "transactional/sponsorship-received": "none",
  "transactional/we-moved": "link",
  "transactional/welcome": "link",
};

/**
 * Whether the template's props must never be stored. A template this list
 * does not know (a message from an older or newer deploy) counts as secret.
 */
export function carriesSecret(template: string): boolean {
  return !(
    Object.hasOwn(EMAIL_BODY_CLASS, template) &&
    EMAIL_BODY_CLASS[template as EmailTemplateId] !== "secret"
  );
}
