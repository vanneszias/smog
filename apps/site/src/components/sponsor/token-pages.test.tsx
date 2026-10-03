import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderSite, rpcError } from "@/test/render";
import { ReeditView } from "./reedit-view";
import { RenewalView } from "./renewal-view";

const LOGO = /^Logo/;

const NAME_IN_VIDEO = /^Name in the video/;
const TOKEN = "a".repeat(43);
const DAY = 86_400_000;

function Edit({ token = TOKEN }: { token?: string | null }): ReactNode {
  return (
    <div data-testid="page">
      <ReeditView token={token} turnstileSiteKey={null} />
    </div>
  );
}

const redirects: string[] = [];

function pushRedirect(url: string): void {
  redirects.push(url);
}

function Renew({ token = TOKEN }: { token?: string | null }): ReactNode {
  return (
    <div data-testid="page">
      <RenewalView
        redirect={pushRedirect}
        token={token}
        turnstileSiteKey={null}
      />
    </div>
  );
}

afterEach(() => {
  cleanup();
  redirects.length = 0;
});

describe("the re-edit page (S-19)", () => {
  test("guards: no token, unknown or used, expired", async () => {
    await renderSite(() => <Edit token={null} />);
    expect(screen.getByRole("heading", { name: "Invalid link" })).toBeDefined();
    cleanup();

    await renderSite(() => <Edit />, {
      api: { "sponsorships/reedit/get": rpcError("TOKEN_INVALID", 404) },
    });
    expect(
      await screen.findByRole("heading", { name: "Link not found" })
    ).toBeDefined();
    cleanup();

    await renderSite(() => <Edit />, {
      api: {
        "sponsorships/reedit/get": rpcError("TOKEN_EXPIRED", 410, {
          expiresAt: Date.UTC(2026, 8, 30, 10),
        }),
      },
    });
    expect(
      await screen.findByRole("heading", { name: "Link expired" })
    ).toBeDefined();
    expect(screen.getByText("Expired on 30 September 2026")).toBeDefined();
  });

  test("edits the name (no logo field without a logo), then sends it for review", async () => {
    const { calls } = await renderSite(() => <Edit />, {
      api: {
        "sponsorships/reedit/get": {
          displayName: "Bakkerij Jansen",
          expiresAt: Date.now() + 3 * DAY - 1000,
          gesture: { name: "Broer", slug: "broer" },
          hasLogo: false,
        },
        "sponsorships/reedit/submit": { submitted: true },
      },
    });
    expect(
      await screen.findByRole("heading", { name: "Update your video" })
    ).toBeDefined();
    expect(screen.getByText("Link expires in 3 days")).toBeDefined();
    expect(screen.queryByLabelText(LOGO)).toBeNull();
    const name = screen.getByLabelText(NAME_IN_VIDEO) as HTMLInputElement;
    expect(name.value).toBe("Bakkerij Jansen");
    fireEvent.change(name, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Send for review" }));
    expect(
      await screen.findByText("The name in the video is required.")
    ).toBeDefined();
    fireEvent.change(name, { target: { value: "Bakkerij Peeters" } });
    fireEvent.click(screen.getByRole("button", { name: "Send for review" }));
    expect(await screen.findByRole("heading", { name: "Sent!" })).toBeDefined();
    expect(
      calls.find((call) => call.path === "sponsorships/reedit/submit")?.input
    ).toEqual({ displayName: "Bakkerij Peeters", token: TOKEN });
  });

  test("offers the logo only when the sponsorship has one", async () => {
    await renderSite(() => <Edit />, {
      api: {
        "sponsorships/reedit/get": {
          displayName: "Bakkerij Jansen",
          expiresAt: Date.now() + DAY,
          gesture: { name: "Broer", slug: "broer" },
          hasLogo: true,
        },
      },
    });
    await screen.findByRole("heading", { name: "Update your video" });
    expect(screen.getByLabelText(LOGO)).toBeDefined();
    expect(
      screen.getByText("Leave empty to keep your current logo.")
    ).toBeDefined();
  });
});

describe("the renewal page (S-20)", () => {
  test("shows the gesture, the new end and the amount, then pays", async () => {
    const endsAt = Date.UTC(2026, 10, 2, 10);
    const { calls } = await renderSite(() => <Renew />, {
      api: {
        "sponsorships/renewal/checkout": {
          checkoutUrl: "https://mollie.test/checkout/tr_2",
          paymentId: "8c3c5a52-7a0c-4d9b-9d65-1f1d7f0c2a11",
        },
        "sponsorships/renewal/get": {
          amountCents: 6000,
          displayName: "Bakkerij Jansen",
          endsAt,
          gesture: { name: "Broer", slug: "broer" },
          hasLogo: true,
        },
      },
    });
    expect(
      await screen.findByRole("heading", { name: "Another year in the video" })
    ).toBeDefined();
    expect(screen.getByText("2 November 2026")).toBeDefined();
    expect(screen.getByText("2 November 2027")).toBeDefined();
    expect(screen.getByText("€60.00")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Renew and pay" }));
    await waitFor(() =>
      expect(redirects).toEqual(["https://mollie.test/checkout/tr_2"])
    );
    expect(
      calls.find((call) => call.path === "sponsorships/renewal/checkout")?.input
    ).toMatchObject({ token: TOKEN });
  });

  test("a sponsorship that can no longer be renewed says so", async () => {
    await renderSite(() => <Renew />, {
      api: {
        "sponsorships/renewal/checkout": rpcError("INVALID_STATE", 409, {
          reason: "notRenewable",
        }),
        "sponsorships/renewal/get": {
          amountCents: 5000,
          displayName: "Bakkerij Jansen",
          endsAt: Date.now() + DAY,
          gesture: { name: "Broer", slug: "broer" },
          hasLogo: false,
        },
      },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Renew and pay" })
    );
    expect(
      await screen.findByText("This sponsorship can no longer be renewed.")
    ).toBeDefined();
  });
});
