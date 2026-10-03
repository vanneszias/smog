import { afterEach, describe, expect, test } from "bun:test";
import type { Availability } from "@smog/sponsorships/schema";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderSite, rpcError } from "@/test/render";
import { SponsorCta, type SponsorCtaProps } from "./sponsor-cta";

const GESTURE: SponsorCtaProps["gesture"] = {
  id: "g-hond",
  slug: "hond",
  sponsor: null,
};
const LIVE_UNTIL = Date.UTC(2027, 4, 12, 10);
const SPONSOR_LINK = /Sponsor now/;

function availability(
  item: Partial<Availability["items"][number]>,
  checkoutEnabled = true
): Availability {
  return {
    checkoutEnabled,
    items: [{ gestureId: "g-hond", state: "available", ...item }],
  };
}

function Page({
  gesture = GESTURE,
}: {
  gesture?: SponsorCtaProps["gesture"];
}): ReactNode {
  return (
    <div data-testid="page">
      <SponsorCta gesture={gesture} level={2} />
    </div>
  );
}

afterEach(cleanup);

describe("the gesture's sponsor card (L-17, ruling 13)", () => {
  test("an available gesture links to the wizard with it preselected", async () => {
    const { calls } = await renderSite(() => <Page />, {
      api: { "sponsorships/availability": availability({}) },
    });
    const link = await screen.findByRole("link", { name: SPONSOR_LINK });
    expect(link.getAttribute("href")).toBe("/sponsor?gesture=hond");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Sponsor this gesture"
    );
    expect(calls).toContainEqual({
      input: { gestureIds: ["g-hond"] },
      path: "sponsorships/availability",
    });
  });

  test("is hidden while sponsoring is paused and the gesture is free", async () => {
    await renderSite(() => <Page />, {
      api: { "sponsorships/availability": availability({}, false) },
    });
    await waitFor(() => expect(screen.queryByText("Loading")).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("link", { name: SPONSOR_LINK })).toBeNull();
    expect(screen.queryByText("Sponsor this gesture")).toBeNull();
  });

  test("a pending gesture says it is being sponsored, without a link", async () => {
    await renderSite(() => <Page />, {
      api: {
        "sponsorships/availability": availability({ state: "pending" }),
      },
    });
    expect(
      await screen.findByText("This gesture is being sponsored.")
    ).toBeDefined();
    expect(screen.queryByRole("link")).toBeNull();
  });

  test("a sponsored gesture names the sponsor and when it is free again", async () => {
    await renderSite(() => <Page />, {
      api: {
        "sponsorships/availability": availability(
          {
            endsAt: LIVE_UNTIL,
            sponsorName: "Bakkerij Jansen",
            state: "sponsored",
          },
          false
        ),
      },
    });
    expect(
      await screen.findByText("This gesture is sponsored by Bakkerij Jansen.")
    ).toBeDefined();
    expect(
      screen.getByText(
        "It will be available for sponsoring again from 12 May 2027."
      )
    ).toBeDefined();
    expect(screen.queryByRole("link")).toBeNull();
  });

  test("an availability error never blocks the page: the card hides (the credit stays)", async () => {
    await renderSite(() => <Page />, {
      api: {
        "sponsorships/availability": rpcError("INTERNAL_SERVER_ERROR", 500),
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("Sponsor this gesture")).toBeNull();
    cleanup();

    await renderSite(
      () => (
        <Page
          gesture={{
            ...GESTURE,
            sponsor: { name: "Bakkerij Jansen", until: LIVE_UNTIL },
          }}
        />
      ),
      {
        api: {
          "sponsorships/availability": rpcError("INTERNAL_SERVER_ERROR", 500),
        },
      }
    );
    expect(
      screen.getByText("This gesture is sponsored by Bakkerij Jansen.")
    ).toBeDefined();
  });
});
