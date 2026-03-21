import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { ConvexHttpClient } from "convex/browser";
import cron from "node-cron";
import { enqueueEmail } from "./services/emailQueue";
import { deleteVideoFromMux } from "./services/mux";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

/**
 * Check for expired sponsorships and restore original videos
 * Runs daily at midnight
 */
export function startExpirationCronJob() {
  // Run every day at 00:00
  cron.schedule("0 0 * * *", async () => {
    try {
      console.log("[Cron] Running sponsorship expiration job...");

      // Get all expired sponsorships from Convex
      const expired = await convex.query(api.sponsorships.getExpired, {});

      if (expired.length === 0) {
        console.log("[Cron] No expired sponsorships found");
        return;
      }

      console.log(`[Cron] Found ${expired.length} expired sponsorship(s)`);

      // Process each expired sponsorship
      for (const sponsorship of expired) {
        try {
          console.log(
            `[Cron] Expiring sponsorship ${sponsorship._id} for gesture ${sponsorship.gestureId}`
          );

          // Expire the sponsorship (this also restores the original video)
          await convex.mutation(api.sponsorships.expire, {
            sponsorshipId: sponsorship._id,
          });

          // Delete the sponsored video from MUX to save costs
          if (sponsorship.sponsoredVideoPlaybackId) {
            await deleteVideoFromMux(sponsorship.sponsoredVideoPlaybackId);
          }

          console.log(
            `[Cron] Successfully expired sponsorship ${sponsorship._id}`
          );
        } catch (error) {
          console.error(
            `[Cron] Error expiring sponsorship ${sponsorship._id}:`,
            error
          );
          // Continue with other sponsorships
        }
      }

      console.log("[Cron] Sponsorship expiration job completed");
    } catch (error) {
      console.error("[Cron] Error in expiration job:", error);
    }
  });

  console.log("[Cron] Sponsorship expiration job scheduled (daily at 00:00)");
}

/**
 * Send renewal reminder emails to sponsors whose sponsorships expire within 30 days
 * Runs daily at 08:00 to arrive in inboxes at a reasonable time
 */
export function startRenewalReminderCronJob() {
  cron.schedule("0 8 * * *", async () => {
    try {
      console.log("[Cron] Running renewal reminder job...");

      // Get active sponsorships expiring within 30 days that haven't had a reminder sent
      const expiringSoon = await convex.query(
        api.sponsorships.getExpiringSoon,
        { daysUntilExpiry: 30 }
      );

      if (expiringSoon.length === 0) {
        console.log("[Cron] No sponsorships need renewal reminders");
        return;
      }

      console.log(
        `[Cron] Found ${expiringSoon.length} sponsorship(s) expiring soon`
      );

      for (const sponsorship of expiringSoon) {
        try {
          // Look up the gesture name for the email
          const gesture = await convex.query(api.gestures.getById, {
            id: sponsorship.gestureId as Id<"gestures">,
          });
          const gestureName = gesture?.name ?? "your gesture";

          // Enqueue renewal reminder email
          await enqueueEmail(
            {
              type: "renewal_reminder",
              to: sponsorship.sponsorEmail,
              sponsorName:
                sponsorship.contactFullName || sponsorship.sponsorName,
              gestureName,
              endDate: sponsorship.endDate,
            },
            `renewal_reminder:${sponsorship._id}`
          );

          // Mark the reminder as sent to prevent duplicate emails
          await convex.mutation(api.sponsorships.markRenewalReminderSent, {
            sponsorshipId: sponsorship._id,
          });

          console.log(
            `[Cron] Renewal reminder enqueued for sponsorship ${sponsorship._id}`
          );
        } catch (error) {
          console.error(
            `[Cron] Error sending renewal reminder for ${sponsorship._id}:`,
            error
          );
          // Continue with other sponsorships
        }
      }

      console.log("[Cron] Renewal reminder job completed");
    } catch (error) {
      console.error("[Cron] Error in renewal reminder job:", error);
    }
  });

  console.log("[Cron] Renewal reminder job scheduled (daily at 08:00)");
}
