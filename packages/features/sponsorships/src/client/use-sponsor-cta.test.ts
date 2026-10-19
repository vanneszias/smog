import { describe, expect, test } from "bun:test";
import type { Availability } from "../schema/availability";
import { type SponsorCtaGesture, sponsorCtaView } from "./use-sponsor-cta";

const ID = "00000000-0000-4000-8000-000000000001";
const ENDS_AT = Date.UTC(2027, 0, 1);

const FREE: SponsorCtaGesture = { id: ID, sponsor: null };
const CREDITED: SponsorCtaGesture = {
  id: ID,
  sponsor: { name: "Bakkerij Jansen", until: ENDS_AT },
};

function answer(
  item: Omit<Availability["items"][number], "gestureId">,
  checkoutEnabled = true
): Availability {
  return { checkoutEnabled, items: [{ ...item, gestureId: ID }] };
}

describe("sponsorCtaView (the gesture CTA's decision table, ruling 13)", () => {
  test("loading or failed without a credit: nothing", () => {
    expect(sponsorCtaView(FREE, undefined)).toBeNull();
  });

  test("loading or failed with a credit: the detail's credit stands", () => {
    expect(sponsorCtaView(CREDITED, undefined)).toEqual({
      endsAt: ENDS_AT,
      kind: "sponsored",
      name: "Bakkerij Jansen",
    });
  });

  test("an answer without this gesture falls back like loading", () => {
    const other: Availability = { checkoutEnabled: true, items: [] };
    expect(sponsorCtaView(CREDITED, other)?.kind).toBe("sponsored");
    expect(sponsorCtaView(FREE, other)).toBeNull();
  });

  test("available with checkout on: the call to action", () => {
    expect(sponsorCtaView(FREE, answer({ state: "available" }))).toEqual({
      kind: "available",
    });
  });

  test("available with checkout off (paused): nothing", () => {
    expect(
      sponsorCtaView(FREE, answer({ state: "available" }, false))
    ).toBeNull();
  });

  test("available with the link hidden (iOS without the flag): nothing", () => {
    expect(
      sponsorCtaView(FREE, answer({ state: "available" }), {
        linkShown: false,
      })
    ).toBeNull();
  });

  test("pending: being sponsored, whatever checkout says", () => {
    expect(sponsorCtaView(FREE, answer({ state: "pending" }, false))).toEqual({
      kind: "pending",
    });
  });

  test("sponsored with a name: the answer's name and end", () => {
    expect(
      sponsorCtaView(
        CREDITED,
        answer({
          endsAt: ENDS_AT + 1,
          sponsorName: "Nieuw",
          state: "sponsored",
        })
      )
    ).toEqual({ endsAt: ENDS_AT + 1, kind: "sponsored", name: "Nieuw" });
  });

  test("sponsored without a name: the credit's name, else empty", () => {
    expect(sponsorCtaView(CREDITED, answer({ state: "sponsored" }))).toEqual({
      endsAt: null,
      kind: "sponsored",
      name: "Bakkerij Jansen",
    });
    expect(sponsorCtaView(FREE, answer({ state: "sponsored" }))).toEqual({
      endsAt: null,
      kind: "sponsored",
      name: "",
    });
  });

  test("unavailable (unknown or unpublished): nothing, even with a credit", () => {
    expect(
      sponsorCtaView(CREDITED, answer({ state: "unavailable" }))
    ).toBeNull();
  });
});
