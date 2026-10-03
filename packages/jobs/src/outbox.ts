import type { EmailOutbox, OutboxEmail } from "@smog/email";
import type { EmailMessage } from "./messages";
import {
  type EnqueueOptions,
  enqueueEmail,
  type QueueProducer,
} from "./producers";

/**
 * The outbox on `EMAIL_QUEUE` (ruling 8): each `send` is one queue message,
 * rendered and sent by the email consumer (`processEmailMessage`). It
 * throws when the queue stays down after the retries, and the caller
 * decides: Better Auth hands its emails over after the response
 * (`waitUntil`) and logs the failure, so the user asks for a new code; the
 * welcome hook logs and goes on. Pass `{ onFailure: "log" }` to swallow.
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
