import type { Locale } from "@smog/i18n";
import type { EmailTemplateId, EmailTemplateProps } from "./render";

/**
 * One email to send later (phase 6 ruling 8): the template, its props, the
 * recipient's locale and address, and an optional idempotency key (the
 * consumer skips a key it has sent in the last 7 days). `From` and
 * `Reply-To` are added by whoever sends it, from env.
 */
export type OutboxEmail = {
  [Id in EmailTemplateId]: {
    idempotencyKey?: string | undefined;
    locale: Locale;
    props: EmailTemplateProps[Id];
    template: Id;
    to: string;
  };
}[EmailTemplateId];

/**
 * Where services hand their emails. `@smog/jobs`' `QueueEmailOutbox` puts
 * each on `EMAIL_QUEUE`; task 2 adds `DirectEmailOutbox` (render and send
 * inline, for tests and as the fallback without the binding).
 */
export interface EmailOutbox {
  send: (email: OutboxEmail) => Promise<void>;
}
