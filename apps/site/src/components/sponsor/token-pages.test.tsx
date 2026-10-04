import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderSite, rpcError } from "@/test/render";
// The preview's Player and Mux reads, faked (before the page loads it).
import "@/test/sponsor-preview-fakes";
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
    expect(
      screen.getByRole("heading", { level: 1, name: "Invalid link" })
    ).toBeDefined();
    cleanup();

    await renderSite(() => <Edit />, {
      api: { "sponsorships/reedit/get": rpcError("TOKEN_INVALID", 404) },
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Link not found" })
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
      await screen.findByRole("heading", { level: 1, name: "Link expired" })
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
    // Announced: the new h1 takes the focus the form had (review I-4).
    const sent = await screen.findByRole("heading", {
      level: 1,
      name: "Sent!",
    });
    await waitFor(() => expect(document.activeElement).toBe(sent));
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

  test("the preview says the kept logo is not shown in it (review M-5)", async () => {
    const KEPT =
      "Your current logo stays in the video. This preview does not show it; choose a new file to replace it.";
    await renderSite(() => <Edit />, {
      api: {
        "gestures/bySlug": {
          canonicalSlug: "broer",
          categories: [],
          description: "",
          id: "00000000-0000-4000-8000-000000000001",
          keywords: [],
          name: "Broer",
          playbackId: "pb-broer",
          publishedAt: 0,
          slug: "broer",
          sponsor: null,
          updatedAt: 0,
        },
        "sponsorships/reedit/get": {
          displayName: "Bakkerij Jansen",
          expiresAt: Date.now() + DAY,
          gesture: { name: "Broer", slug: "broer" },
          hasLogo: true,
        },
      },
    });
    expect(await screen.findByText(KEPT)).toBeDefined();
    expect(
      screen.getByRole("img", { name: "Preview for Broer" })
    ).toBeDefined();
    const input = document.querySelector("input#logo-upload");
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("no logo input");
    }
    fireEvent.change(input, {
      target: {
        files: [
          new File([new Uint8Array([1])], "logo.png", { type: "image/png" }),
        ],
      },
    });
    await waitFor(() => expect(screen.queryByText(KEPT)).toBeNull());
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

  test("a retry after any failed attempt is a new checkout id (task 5)", async () => {
    let answer: unknown = rpcError("INTERNAL_SERVER_ERROR", 500);
    const { calls } = await renderSite(() => <Renew />, {
      api: {
        "sponsorships/renewal/checkout": () => answer,
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
    await screen.findByText("The payment could not start. Please try again.");
    answer = {
      checkoutUrl: "https://mollie.test/checkout/tr_9",
      paymentId: "8c3c5a52-7a0c-4d9b-9d65-1f1d7f0c2a11",
    };
    fireEvent.click(screen.getByRole("button", { name: "Renew and pay" }));
    await waitFor(() => expect(redirects).toHaveLength(1));
    const ids = calls
      .filter((call) => call.path === "sponsorships/renewal/checkout")
      .map((call) => (call.input as { checkoutId: string }).checkoutId);
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
  });

  test("Pay cannot run twice while the browser leaves for Mollie (phase review M-1)", async () => {
    const { calls } = await renderSite(() => <Renew />, {
      api: {
        "sponsorships/renewal/checkout": {
          checkoutUrl: "https://mollie.test/checkout/tr_7",
          paymentId: "8c3c5a52-7a0c-4d9b-9d65-1f1d7f0c2a11",
        },
        "sponsorships/renewal/get": {
          amountCents: 5000,
          displayName: "Bakkerij Jansen",
          endsAt: Date.now() + DAY,
          gesture: { name: "Broer", slug: "broer" },
          hasLogo: false,
        },
      },
    });
    const pay = await screen.findByRole("button", { name: "Renew and pay" });
    fireEvent.click(pay);
    await waitFor(() => expect(redirects).toHaveLength(1));
    // Busy while the browser navigates away.
    await waitFor(() => expect(pay.getAttribute("aria-busy")).toBe("true"));
    fireEvent.click(pay);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(
      calls.filter((call) => call.path === "sponsorships/renewal/checkout")
    ).toHaveLength(1);
  });

  test("a link to a sponsorship that can no longer be renewed is a dead end, not a retry (review I-1)", async () => {
    const { calls } = await renderSite(() => <Renew />, {
      api: {
        "sponsorships/renewal/get": rpcError("INVALID_STATE", 409, {
          reason: "notRenewable",
        }),
      },
    });
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Link no longer usable",
      })
    ).toBeDefined();
    expect(
      screen.getByText("This sponsorship can no longer be renewed.")
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Back to the website" })
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    // Defined errors are not retried: one read.
    expect(
      calls.filter((call) => call.path === "sponsorships/renewal/get")
    ).toHaveLength(1);
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
