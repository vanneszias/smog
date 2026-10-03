import { processEmailMessage } from "@smog/jobs";
import { emailDeliveryEnv, getEmailSender, siteEnv } from "@/server/auth";

/**
 * The `EMAIL_QUEUE` consumer (spec §8.1, phase 6 ruling 8). Each message
 * of the batch, one at a time: `processEmailMessage` (`@smog/jobs`) parses
 * it, skips a key already sent, renders it and sends it with the env's
 * sender (dev: the KV mailbox at `/dev/mail`; staging and production: the
 * `EMAIL` binding, From/Reply-To from `wrangler.jsonc`), and this applies
 * its decision: ack, or retry after its backoff. After `max_retries` (5)
 * the platform moves a message to `smog-<env>-email-dlq`.
 */
export async function handleEmailBatch(
  batch: MessageBatch,
  _env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  const deps = {
    env: emailDeliveryEnv(),
    kv: siteEnv().kv,
    sender: getEmailSender(),
  };
  for (const message of batch.messages) {
    // biome-ignore lint/performance/noAwaitInLoops: one message at a time (ruling 8), so a slow send never fans out.
    const decision = await processEmailMessage(message, deps);
    if (decision.action === "retry") {
      message.retry({ delaySeconds: decision.delaySeconds });
    } else {
      message.ack();
    }
  }
}
