import { mollieClient } from "@smog/auth";
import type { Context } from "hono";
import { processSuccessfulPayment } from "../services/sponsorship";

/**
 * Handle Mollie payment webhook
 * This is called by Mollie when a payment status changes
 */
export async function handleMollieWebhook(c: Context) {
  try {
    console.log("[Mollie Webhook] Received webhook");

    // Try to parse body - Mollie sends JSON
    let body: { id?: string } = {};
    try {
      body = await c.req.json<{ id: string }>();
    } catch {
      // If JSON parsing fails, try form data
      try {
        const formData = await c.req.formData();
        const id = formData.get("id");
        if (typeof id === "string") {
          body = { id };
        }
      } catch {
        // If both fail, log the raw body
        console.error("[Mollie Webhook] Failed to parse body");
      }
    }

    const paymentId = body.id;

    if (!paymentId) {
      console.error("[Mollie Webhook] No payment ID in webhook");
      return c.json({ error: "Payment ID required" }, 400);
    }

    console.log("[Mollie Webhook] Payment ID:", paymentId);

    // Get payment details from Mollie
    const payment = await mollieClient.payments.get(paymentId);
    console.log("[Mollie Webhook] Payment status:", payment.status);

    // Only process paid payments
    if (payment.status !== "paid") {
      console.log(
        `[Mollie Webhook] Payment not paid (status: ${payment.status}), skipping`
      );
      return c.json({ status: "skipped" }, 200);
    }

    // Get sponsorship ID from payment metadata
    const metadata = payment.metadata as Record<string, string> | undefined;
    const sponsorshipId = metadata?.sponsorshipId;
    if (!sponsorshipId) {
      console.error("[Mollie Webhook] No sponsorship ID in payment metadata");
      return c.json({ error: "Sponsorship ID missing in metadata" }, 400);
    }

    console.log("[Mollie Webhook] Processing sponsorship:", sponsorshipId);

    // Process the successful payment
    // This will mark the sponsorship as "pending_payment" awaiting admin approval
    await processSuccessfulPayment({
      sponsorshipId,
      molliePaymentId: paymentId,
    });

    console.log("[Mollie Webhook] Payment processed successfully");
    return c.json({ status: "success" }, 200);
  } catch (error) {
    console.error("[Mollie Webhook] Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: errorMessage }, 500);
  }
}
