/**
 * Email Queue
 *
 * BullMQ-backed queue for asynchronous email delivery.
 * The worker processes jobs by rendering React Email templates and
 * handing them off to the nodemailer transporter.
 */

import { render } from "@react-email/render";
import { type ConnectionOptions, Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import {
  AdminNewSponsorshipEmail,
  PaymentConfirmedEmail,
  RenewalReminderEmail,
  SponsorshipLiveEmail,
  SponsorshipSubmittedEmail,
  WelcomeEmail,
} from "../emails";
import { sendEmail } from "./email";

// =============================================================================
// Redis connection
// =============================================================================

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/1";

// Shared connection reused by both the Queue producer and the Worker consumer
const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
});

connection.on("error", (err) => {
  console.error("[Redis] Connection error:", err.message);
});

// =============================================================================
// Job payload types
// =============================================================================

interface WelcomeEmailJob {
  type: "welcome";
  to: string;
  name?: string;
}

interface SponsorshipSubmittedEmailJob {
  type: "sponsorship_submitted";
  to: string;
  sponsorName: string;
  gestureName: string;
}

interface PaymentConfirmedEmailJob {
  type: "payment_confirmed";
  to: string;
  sponsorName: string;
  gestureName: string;
  paymentAmount: number;
}

interface SponsorshipLiveEmailJob {
  type: "sponsorship_live";
  to: string;
  sponsorName: string;
  gestureName: string;
  startDate: number;
  endDate: number;
}

interface RenewalReminderEmailJob {
  type: "renewal_reminder";
  to: string;
  sponsorName: string;
  gestureName: string;
  endDate: number;
}

interface AdminNewSponsorshipEmailJob {
  type: "admin_new_sponsorship";
  to: string;
  sponsorName: string;
  sponsorEmail: string;
  gestureNames: string[];
  contactFullName: string;
  contactCompany?: string;
  invoiceRequested?: boolean;
  invoiceName?: string;
  invoiceVatNumber?: string;
  invoiceEmail?: string;
  durationYears?: number;
}

export type EmailJob =
  | WelcomeEmailJob
  | SponsorshipSubmittedEmailJob
  | PaymentConfirmedEmailJob
  | SponsorshipLiveEmailJob
  | RenewalReminderEmailJob
  | AdminNewSponsorshipEmailJob;

type EmailJobName = EmailJob["type"];

// =============================================================================
// Queue (producer)
// =============================================================================

const EMAIL_QUEUE = "email";

const emailQueue = new Queue<EmailJob, void, EmailJobName>(EMAIL_QUEUE, {
  connection: connection as unknown as ConnectionOptions,
});

/**
 * Enqueue an email job for async delivery.
 * Deduplication is handled by BullMQ: passing a deterministic jobId
 * prevents the same email being sent twice in rapid succession.
 */
export async function enqueueEmail(
  job: EmailJob,
  jobId?: string
): Promise<void> {
  try {
    await emailQueue.add(job.type, job, {
      jobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    });
    console.log(`[EmailQueue] Enqueued job type="${job.type}" to=${job.to}`);
  } catch (error) {
    console.error("[EmailQueue] Failed to enqueue job:", error);
    throw error;
  }
}

// =============================================================================
// Worker (consumer) — started once at server boot
// =============================================================================

async function processEmailJob(job: EmailJob): Promise<void> {
  let html: string;
  let subject: string;

  switch (job.type) {
    case "welcome": {
      subject = "Welkom bij SMOG!";
      html = await render(WelcomeEmail({ name: job.name }));
      break;
    }
    case "sponsorship_submitted": {
      subject = "We hebben je sponsoring ontvangen";
      html = await render(
        SponsorshipSubmittedEmail({
          sponsorName: job.sponsorName,
          gestureName: job.gestureName,
        })
      );
      break;
    }
    case "payment_confirmed": {
      subject = "Betaling bevestigd — bedankt!";
      html = await render(
        PaymentConfirmedEmail({
          sponsorName: job.sponsorName,
          gestureName: job.gestureName,
          paymentAmount: job.paymentAmount,
        })
      );
      break;
    }
    case "sponsorship_live": {
      subject = "Je sponsoring is nu live!";
      html = await render(
        SponsorshipLiveEmail({
          sponsorName: job.sponsorName,
          gestureName: job.gestureName,
          startDate: job.startDate,
          endDate: job.endDate,
        })
      );
      break;
    }
    case "renewal_reminder": {
      subject = "Je SMOG-sponsoring verloopt binnenkort";
      html = await render(
        RenewalReminderEmail({
          sponsorName: job.sponsorName,
          gestureName: job.gestureName,
          endDate: job.endDate,
        })
      );
      break;
    }
    case "admin_new_sponsorship": {
      subject = `Nieuwe sponsoring van ${job.sponsorName}`;
      html = await render(
        AdminNewSponsorshipEmail({
          sponsorName: job.sponsorName,
          sponsorEmail: job.sponsorEmail,
          gestureNames: job.gestureNames,
          contactFullName: job.contactFullName,
          contactCompany: job.contactCompany,
          invoiceRequested: job.invoiceRequested,
          invoiceName: job.invoiceName,
          invoiceVatNumber: job.invoiceVatNumber,
          invoiceEmail: job.invoiceEmail,
          durationYears: job.durationYears,
        })
      );
      break;
    }
    default: {
      const exhaustive: never = job;
      throw new Error(
        `Unknown email job type: ${(exhaustive as EmailJob).type}`
      );
    }
  }

  await sendEmail({ to: job.to, subject, html });
}

export function startEmailWorker(): void {
  const worker = new Worker<EmailJob, void, EmailJobName>(
    EMAIL_QUEUE,
    async (bullJob) => {
      console.log(
        `[EmailWorker] Processing job id=${bullJob.id} type=${bullJob.data.type}`
      );
      await processEmailJob(bullJob.data);
    },
    { connection: connection as unknown as ConnectionOptions }
  );

  worker.on("completed", (bullJob) => {
    console.log(
      `[EmailWorker] Job completed id=${bullJob.id} type=${bullJob.data.type}`
    );
  });

  worker.on("failed", (bullJob, err) => {
    console.error(
      `[EmailWorker] Job failed id=${bullJob?.id} type=${bullJob?.data?.type}:`,
      err
    );
  });

  console.log("[EmailWorker] Worker started, listening for email jobs");
}
