import type { EmailTemplateId, EmailTemplateProps } from "./render";

export type { EmailTemplateId } from "./render";

/** Reserved for examples (RFC 2606): a sample never points at a real host. */
const SAMPLE_ORIGIN = "https://smog.example";
const SAMPLE_PAYMENT_ID = "0b6c6d4e-6c43-4e1c-9a59-8a1b4c0d9e01";
const SAMPLE_SPONSORSHIP_ID = "5a1e0c3d-2b4f-4e6a-8c7d-9e0f1a2b3c4d";

/**
 * One sample prop set per template, for the admin email previews (A-25,
 * W-07): they render the real template in each locale and are never sent.
 * The mapped type makes `check-types` fail when a registered template has
 * no sample. No real addresses or people: example hosts (addresses on
 * `smog.example` only) and placeholder names.
 */
export const EMAIL_SAMPLES: {
  readonly [Id in EmailTemplateId]: EmailTemplateProps[Id];
} = {
  "auth/magic-link": {
    minutes: 5,
    url: `${SAMPLE_ORIGIN}/api/auth/magic-link/verify?token=sample`,
  },
  "auth/otp": { code: "482913", minutes: 5 },
  "auth/reset-password": {
    minutes: 60,
    name: "Alex",
    url: `${SAMPLE_ORIGIN}/reset-password?token=sample`,
  },
  "auth/verify-email": {
    minutes: 60,
    url: `${SAMPLE_ORIGIN}/api/auth/verify-email?token=sample`,
  },
  // One checkout of two gestures, one with a logo (€ 60) and one without
  // (€ 50), by Acme BV with an invoice request.
  "transactional/admin-new-sponsorship": {
    contact: { company: "Acme BV", email: "alex@smog.example", name: "Alex" },
    displayName: "Acme BV",
    gestures: [
      { amountCents: 6000, name: "Hond" },
      { amountCents: 5000, name: "Kat" },
    ],
    invoice: {
      email: "facturen@smog.example",
      name: "Acme BV",
      vatNumber: "0123456749",
    },
    kind: "initial",
    paymentId: SAMPLE_PAYMENT_ID,
    totalCents: 11_000,
    url: `${SAMPLE_ORIGIN}/admin/sponsorships?payment=${SAMPLE_PAYMENT_ID}`,
  },
  "transactional/admin-refund-needed": {
    amountCents: 6000,
    paymentId: SAMPLE_PAYMENT_ID,
    reason: "late",
    url: `${SAMPLE_ORIGIN}/mollie/dashboard/payments/tr_sample`,
  },
  "transactional/admin-render-failed": {
    displayName: "Acme BV",
    error: "The render container timed out after 20 minutes.",
    gestureName: "Hond",
    url: `${SAMPLE_ORIGIN}/admin/sponsorships/${SAMPLE_SPONSORSHIP_ID}`,
  },
  "transactional/payment-confirmed": {
    amountCents: 6000,
    endsAt: null,
    gestureName: "Hond",
    kind: "initial",
    name: "Alex",
  },
  "transactional/renewal-reminder": {
    endsAt: "2027-10-02T08:00:00.000Z",
    gestureName: "Hond",
    name: "Alex",
    url: `${SAMPLE_ORIGIN}/sponsor/renew?token=sample`,
  },
  "transactional/sponsorship-live": {
    displayName: "Acme BV",
    endsAt: "2027-10-02T08:00:00.000Z",
    gestureName: "Hond",
    name: "Alex",
    startsAt: "2026-10-02T08:00:00.000Z",
    url: `${SAMPLE_ORIGIN}/gestures/hond`,
  },
  "transactional/sponsorship-received": {
    displayName: "Acme BV",
    gestureName: "Hond",
    name: "Alex",
  },
  "transactional/we-moved": {
    providers: ["google", "apple"],
    url: SAMPLE_ORIGIN,
  },
  "transactional/welcome": { name: "Alex", url: SAMPLE_ORIGIN },
};

/**
 * Every registered template: `EMAIL_SAMPLES` must have one entry per
 * template (its type), so its keys are the registry. Light (no renderer),
 * so a contract can validate ids with it.
 */
export const EMAIL_TEMPLATE_IDS = Object.keys(EMAIL_SAMPLES) as [
  EmailTemplateId,
  ...EmailTemplateId[],
];
