import type { CatalogueOverlay, Locale } from "@smog/i18n";
import {
  type EmailTemplateId,
  type EmailTemplateProps,
  renderEmail,
} from "./render";
import type { EmailSender } from "./sender";

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
 * each on `EMAIL_QUEUE`; `DirectEmailOutbox` renders and sends inline.
 */
export interface EmailOutbox {
  send: (email: OutboxEmail) => Promise<void>;
}

/** What sending needs from env: the envelope and the site (the header logo). */
export interface EmailDeliveryEnv {
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  SITE_URL: string;
}

/**
 * Renders one outbox email in its locale and sends it with `From` and
 * `Reply-To` from env. The one path from an `OutboxEmail` to a sender: the
 * email queue's consumer and `DirectEmailOutbox` both use it. A render
 * failure is an `EmailRenderError`; a send failure is the sender's error.
 * Neither is logged here: the caller logs once (the consumer without the
 * address, which a binding error may contain).
 */
export async function deliverEmail(
  sender: EmailSender,
  {
    email,
    env,
    overlay,
  }: {
    email: OutboxEmail;
    env: EmailDeliveryEnv;
    /** The `ui_string` overlay of the recipient's language (see `RenderOptions`). */
    overlay?: CatalogueOverlay | undefined;
  }
): Promise<void> {
  // Each template's props match its id (`OutboxEmail` is a union by id).
  const rendered = await renderEmail(
    email.template,
    email.props as never,
    email.locale,
    { overlay, siteUrl: env.SITE_URL }
  );
  await sender.send({
    ...rendered,
    from: env.EMAIL_FROM,
    replyTo: env.EMAIL_REPLY_TO,
    to: email.to,
  });
}

/** Reads the `ui_string` overlay of a language (the Worker's catalogue loader). */
export type OverlayLoader = (locale: Locale) => Promise<CatalogueOverlay>;

/**
 * The overlay of `locale`, or none: a failing loader never stops an email
 * (the shipped texts are always there).
 */
export async function safeOverlay(
  load: OverlayLoader | undefined,
  locale: Locale
): Promise<CatalogueOverlay | undefined> {
  if (!load) {
    return;
  }
  try {
    return await load(locale);
  } catch (error) {
    console.error("[email] Failed to load the string overlay:", error);
  }
}

/**
 * Renders and sends inline (ruling 8): for tests, and the site's fallback
 * when the `EMAIL_QUEUE` binding is missing (logged there). It keeps no
 * idempotency markers, so `idempotencyKey` is ignored: only the queue's
 * consumer skips a key it has sent.
 */
export class DirectEmailOutbox implements EmailOutbox {
  readonly #env: EmailDeliveryEnv;
  readonly #loadOverlay: OverlayLoader | undefined;
  readonly #sender: EmailSender;

  constructor(
    sender: EmailSender,
    env: EmailDeliveryEnv,
    loadOverlay?: OverlayLoader
  ) {
    this.#sender = sender;
    this.#env = env;
    this.#loadOverlay = loadOverlay;
  }

  async send(email: OutboxEmail): Promise<void> {
    await deliverEmail(this.#sender, {
      email,
      env: this.#env,
      overlay: await safeOverlay(this.#loadOverlay, email.locale),
    });
  }
}
