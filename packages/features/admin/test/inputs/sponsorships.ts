import { DAY_MS } from "@smog/utils";
import { testMollie } from "../sponsorship-fakes";
import {
  seedCheckout,
  seedRenderFailed,
  seedToken,
} from "../sponsorship-helpers";
import type { ProcedureInputs } from "./index";

/**
 * For each `admin.sponsorships` procedure, a function from the fixtures to
 * an input the admin call succeeds with (a mutation then proves it built
 * and ran its audit entries). Each mutation gets its own sponsorship in the
 * state its action needs.
 */
export const SPONSORSHIPS_INPUTS: ProcedureInputs = {
  "sponsorships.approve": async () => ({
    id: (await seedCheckout({ status: "in_review", videoPlaybackId: "vid" }))
      .sponsorshipIds[0],
  }),
  "sponsorships.cancel": async () => ({
    paymentId: (await seedCheckout({ count: 2 })).paymentId,
  }),
  "sponsorships.forceExpire": async () => {
    const seeded = await seedCheckout({
      endsAt: new Date(Date.now() + 100 * DAY_MS),
      paymentStatus: "paid",
      startsAt: new Date(),
      status: "live",
    });
    return {
      confirmName: seeded.gestures[0]?.name,
      id: seeded.sponsorshipIds[0],
    };
  },
  "sponsorships.get": async () => ({
    id: (await seedCheckout({ invoice: true, logo: true })).sponsorshipIds[0],
  }),
  "sponsorships.list": () => ({}),
  "sponsorships.markPaid": async () => ({
    note: "Overschrijving 2026-10-03",
    paymentId: (await seedCheckout({ count: 2 })).paymentId,
  }),
  "sponsorships.recordRefund": async () => {
    const seeded = await seedCheckout({
      mollie: true,
      paymentStatus: "paid",
      status: "live",
    });
    testMollie.setStatus(seeded.mollieId as string, "paid");
    testMollie.refund(seeded.mollieId as string, 1000);
    return { paymentId: seeded.paymentId };
  },
  "sponsorships.regenerateToken": async () => {
    const seeded = await seedCheckout({
      paymentStatus: "paid",
      status: "changes_requested",
    });
    const id = seeded.sponsorshipIds[0] as string;
    await seedToken(id, "reedit");
    return { id, purpose: "reedit" };
  },
  "sponsorships.reject": async () => ({
    id: (await seedCheckout({ status: "in_review" })).sponsorshipIds[0],
    reason: "Het logo is onleesbaar",
  }),
  "sponsorships.requestChanges": async () => ({
    id: (await seedCheckout({ paymentStatus: "paid", status: "in_review" }))
      .sponsorshipIds[0],
  }),
  "sponsorships.retryRender": async () => ({
    id: (await seedRenderFailed()).sponsorshipIds[0],
  }),
};
