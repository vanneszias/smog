import { describe, expect, it } from "bun:test";
import { MOLLIE_PAYMENT_STATUSES } from "./schema";
import { mapMollieStatus } from "./status";

describe("mapMollieStatus", () => {
  it("maps every Mollie payment status to ours", () => {
    expect(
      Object.fromEntries(
        MOLLIE_PAYMENT_STATUSES.map((status) => [
          status,
          mapMollieStatus(status),
        ])
      )
    ).toEqual({
      authorized: "open",
      canceled: "canceled",
      expired: "expired",
      failed: "failed",
      open: "open",
      paid: "paid",
      pending: "open",
    });
  });
});
