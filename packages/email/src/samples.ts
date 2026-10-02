import type { EmailTemplateId, EmailTemplateProps } from "./render";

export type { EmailTemplateId } from "./render";

/** Reserved for examples (RFC 2606): a sample never points at a real host. */
const SAMPLE_ORIGIN = "https://smog.example";

/**
 * One sample prop set per template, for the admin email previews (A-25,
 * W-07): they render the real template in each locale and are never sent.
 * The mapped type makes `check-types` fail when a registered template has
 * no sample (phase 6's templates add theirs here). No real addresses or
 * people: example hosts and a placeholder name only.
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
