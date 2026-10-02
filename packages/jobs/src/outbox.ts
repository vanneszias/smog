import type { EmailOutbox, OutboxEmail } from "@smog/email";
import type { EmailMessage } from "./messages";
import {
  type EnqueueOptions,
  enqueueEmail,
  type QueueProducer,
} from "./producers";

/**
 * The outbox on `EMAIL_QUEUE` (ruling 8): each `send` is one queue message,
 * rendered and sent by the email consumer. It throws when the queue stays
 * down after the retries (the caller decides: Better Auth fails the
 * request, so the user can ask for the code again); pass
 * `{ onFailure: "log" }` to swallow instead.
 */
export class QueueEmailOutbox implements EmailOutbox {
  readonly #options: EnqueueOptions;
  readonly #queue: QueueProducer<EmailMessage>;

  constructor(
    queue: QueueProducer<EmailMessage>,
    options: EnqueueOptions = {}
  ) {
    this.#queue = queue;
    this.#options = { onFailure: "throw", ...options };
  }

  async send(email: OutboxEmail): Promise<void> {
    await enqueueEmail(this.#queue, email, this.#options);
  }
}
