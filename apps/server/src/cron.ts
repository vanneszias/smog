import { api } from "@smog/convex";
import { ConvexHttpClient } from "convex/browser";
import cron from "node-cron";
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
