import { mollieClient } from "@smog/auth/server";
import type { Context } from "hono";
import { processSuccessfulPayment } from "../services/sponsorship";

/**
 * Handle Mollie payment webhook
 * This is called by Mollie when a payment status changes
 */
export async function handleMollieWebhook(c: Context) {
  try {
    console.log("[Mollie Webhook] Received webhook");
    console.log("[Mollie Webhook] Content-Type:", c.req.header("content-type"));

    // Try to parse body - Mollie sends JSON
    let body: { id?: string } = {};

    try {
      const rawBody = await c.req.text();
      console.log("[Mollie Webhook] Raw body:", rawBody);

      // Try parsing as JSON first
      try {
        body = JSON.parse(rawBody);
      } catch {
        // If not JSON, try parsing as form data (id=xxx)
        const params = new URLSearchParams(rawBody);
        const id = params.get("id");
        if (id) {
          body = { id };
        }
      }
    } catch (error) {
      console.error("[Mollie Webhook] Failed to read body:", error);
    }

    const paymentId = body.id;

    if (!paymentId) {
      console.error(
        "[Mollie Webhook] No payment ID in webhook. Parsed body:",
        JSON.stringify(body)
      );
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

    // Get sponsorship ID(s) from payment metadata
    const metadata = payment.metadata as Record<string, string> | undefined;
    const sponsorshipId = metadata?.sponsorshipId;
    const isBulkPayment = metadata?.isBulkPayment === "true";
    const sponsorshipIdsJson = metadata?.sponsorshipIds;

    if (isBulkPayment && sponsorshipIdsJson) {
      // Handle bulk payment
      console.log("[Mollie Webhook] Processing bulk payment");
      const sponsorshipIds = JSON.parse(sponsorshipIdsJson) as string[];
      console.log(
        `[Mollie Webhook] Processing ${sponsorshipIds.length} sponsorships`
      );

      // Process all sponsorships
      await Promise.all(
        sponsorshipIds.map((id) =>
          processSuccessfulPayment({
            sponsorshipId: id,
            molliePaymentId: paymentId,
          })
        )
      );

      console.log(
        `[Mollie Webhook] Bulk payment processed successfully for ${sponsorshipIds.length} sponsorships`
      );
      return c.json({ status: "success", count: sponsorshipIds.length }, 200);
    }

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
