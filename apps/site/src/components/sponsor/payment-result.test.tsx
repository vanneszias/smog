import { afterEach, describe, expect, test } from "bun:test";
import type { PaymentStatusView } from "@smog/sponsorships/schema";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderSite, rpcError } from "@/test/render";
import { PaymentResult } from "./payment-result";

const PAYMENT = "8c3c5a52-7a0c-4d9b-9d65-1f1d7f0c2a11";

function view(overrides: Partial<PaymentStatusView> = {}): PaymentStatusView {
  return {
    displayName: "Bakkerij Jansen",
    items: [
      { gestureName: "Broer", gestureSlug: "broer", includesLogo: true },
      { gestureName: "Zus", gestureSlug: "zus", includesLogo: true },
    ],
    kind: "initial",
    status: "paid",
    totalCents: 12_000,
    ...overrides,
  };
}

function Result({ payment = PAYMENT }: { payment?: string | null }): ReactNode {
  return (
    <div data-testid="page">
      <PaymentResult intervalMs={5} maxAttempts={3} payment={payment} />
    </div>
  );
}

function polls(calls: { path: string }[]): number {
  return calls.filter((call) => call.path === "sponsorships/paymentStatus")
    .length;
}

afterEach(cleanup);

describe("the payment's return page (S-14)", () => {
  test("paid: the summary with formatMoney and the what-happens-next timeline", async () => {
    const { calls } = await renderSite(() => <Result />, {
      api: { "sponsorships/paymentStatus": view() },
    });
    expect(
      await screen.findByRole("heading", { name: "Payment successful!" })
    ).toBeDefined();
    expect(screen.getByText("Broer, Zus")).toBeDefined();
    expect(screen.getByText("Bakkerij Jansen")).toBeDefined();
    expect(screen.getByText("€120.00")).toBeDefined();
    expect(
      screen.getByText(
        "An administrator reviews your sponsorship within five working days."
      )
    ).toBeDefined();
    expect(calls[0]?.input).toEqual({ payment: PAYMENT });
    // A final answer stops the poll.
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(polls(calls)).toBe(1);
  });

  test("open: polls, counts the attempts, then says it takes longer; Check again polls anew", async () => {
    const { calls } = await renderSite(() => <Result />, {
      api: { "sponsorships/paymentStatus": view({ status: "open" }) },
    });
    expect(
      await screen.findByRole("heading", {
        name: "Your payment is being processed…",
      })
    ).toBeDefined();
    expect(
      await screen.findByRole("heading", {
        name: "This is taking longer than expected",
      })
    ).toBeDefined();
    expect(polls(calls)).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(polls(calls)).toBe(6));
    expect(
      await screen.findByRole("heading", {
        name: "This is taking longer than expected",
      })
    ).toBeDefined();
  });

  test("open, then paid while polling", async () => {
    let answers = 0;
    await renderSite(() => <Result />, {
      api: {
        "sponsorships/paymentStatus": () => {
          answers += 1;
          return view({ status: answers < 2 ? "open" : "paid" });
        },
      },
    });
    expect(
      await screen.findByRole("heading", { name: "Payment successful!" })
    ).toBeDefined();
  });

  test.each([
    ["failed", "The payment did not go through"],
    ["canceled", "The payment was cancelled"],
    ["expired", "The payment expired"],
  ] as const)(
    "%s: Try again goes back to the wizard with the selection",
    async (status, title) => {
      await renderSite(() => <Result />, {
        api: { "sponsorships/paymentStatus": view({ status }) },
      });
      expect(await screen.findByRole("heading", { name: title })).toBeDefined();
      expect(
        screen.getByRole("link", { name: "Try again" }).getAttribute("href")
      ).toBe("/sponsor?gesture=broer%2Czus");
    }
  );

  test("refund_needed: we will contact you", async () => {
    await renderSite(() => <Result />, {
      api: {
        "sponsorships/paymentStatus": view({ status: "refund_needed" }),
      },
    });
    expect(
      await screen.findByRole("heading", { name: "We will contact you" })
    ).toBeDefined();
    expect(screen.queryByRole("link", { name: "Try again" })).toBeNull();
  });

  test("a paid renewal says until when", async () => {
    await renderSite(() => <Result />, {
      api: {
        "sponsorships/paymentStatus": view({
          kind: "renewal",
          renewedUntil: Date.UTC(2028, 4, 12, 10),
          totalCents: 6000,
        }),
      },
    });
    expect(
      await screen.findByRole("heading", {
        name: "Your sponsorship is renewed!",
      })
    ).toBeDefined();
    expect(
      screen.getByText("Your name stays in the video until 12 May 2028.")
    ).toBeDefined();
  });

  test("no or an unknown payment: a calm notice", async () => {
    await renderSite(() => <Result payment={null} />);
    expect(
      screen.getByRole("heading", { name: "No payment found" })
    ).toBeDefined();
    cleanup();
    await renderSite(() => <Result />, {
      api: { "sponsorships/paymentStatus": rpcError("NOT_FOUND", 404) },
    });
    expect(
      await screen.findByRole("heading", { name: "No payment found" })
    ).toBeDefined();
  });
});
