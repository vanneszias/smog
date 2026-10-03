import { afterEach, describe, expect, test } from "bun:test";
import type { Availability } from "@smog/sponsorships/schema";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { renderSite, rpcError } from "@/test/render";
import { SponsorWizard } from "./wizard";

const NAME_IN_THE_VIDEO = /^Name in the video/;
const FULL_NAME = /^Full name/;
const EMAIL = /^Email/;
const NAME_ON_THE_INVOICE = /^Name on the invoice/;
const ENTERPRISE_NUMBER = /^Enterprise number/;
const LOGO = /^Logo/;
const PREVIEW_FOR = /Preview for/;

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const GESTURES = [
  { id: ID(1), name: "Broer", slug: "broer" },
  { id: ID(2), name: "Zus", slug: "zus" },
  { id: ID(3), name: "Mama", slug: "mama" },
].map((gesture) => ({
  ...gesture,
  categories: [{ name: "Familie", slug: "familie" }],
  matchedField: null,
  matchType: null,
  playbackId: `pb-${gesture.slug}`,
  score: 0,
}));

function availability(
  taken: Record<string, "pending" | "sponsored"> = {},
  checkoutEnabled = true
) {
  return (input: unknown): Availability => ({
    checkoutEnabled,
    items: (input as { gestureIds: string[] }).gestureIds.map((gestureId) => ({
      gestureId,
      state: taken[gestureId] ?? "available",
    })),
  });
}

function api(overrides: Record<string, unknown> = {}) {
  return {
    "gestures/bySlug": (input: unknown) => {
      const gesture = GESTURES.find(
        (item) => item.slug === (input as { slug: string }).slug
      );
      return gesture
        ? {
            ...gesture,
            canonicalSlug: gesture.slug,
            description: "",
            keywords: [],
            publishedAt: 0,
            sponsor: null,
            updatedAt: 0,
          }
        : rpcError("NOT_FOUND", 404);
    },
    "gestures/categories": [
      { gestureCount: 3, name: "Familie", slug: "familie" },
    ],
    "gestures/search": { items: GESTURES, total: GESTURES.length },
    "sponsorships/availability": availability({ [ID(3)]: "sponsored" }),
    ...overrides,
  };
}

const INVOICE_EMAIL = /^Email address for the invoice/;
const redirects: string[] = [];

function pushRedirect(url: string): void {
  redirects.push(url);
}

function Wizard({ preselect = [] }: { preselect?: string[] }): ReactNode {
  return (
    <div data-testid="page">
      <SponsorWizard
        preselect={preselect}
        redirect={pushRedirect}
        turnstileSiteKey={null}
      />
    </div>
  );
}

function card(name: string): HTMLElement {
  return screen.getByRole("button", { name: `Choose ${name}` });
}

async function chooseBroerAndZus(): Promise<void> {
  await waitFor(() =>
    expect(card("Broer").getAttribute("data-state")).toBe("available")
  );
  fireEvent.click(card("Broer"));
  fireEvent.click(card("Zus"));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", {
    level: 1,
    name: "Configure your sponsorship",
  });
}

function type(label: string | RegExp, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function fillDetails(): Promise<void> {
  type(NAME_IN_THE_VIDEO, "Bakkerij Jansen");
  type(FULL_NAME, "Jan Jansen");
  type(EMAIL, "jan@voorbeeld.be");
  fireEvent.click(screen.getByRole("button", { name: "Continue to preview" }));
  await screen.findByRole("heading", {
    level: 1,
    name: "Review your sponsorship",
  });
}

afterEach(() => {
  cleanup();
  redirects.length = 0;
});

describe("the sponsor wizard (S-01–S-11)", () => {
  test("step 1: availability badges, a disabled sponsored card, the bar's count and total", async () => {
    await renderSite(() => <Wizard />, { api: api() });
    await waitFor(() =>
      expect(card("Mama").getAttribute("data-state")).toBe("sponsored")
    );
    expect((card("Mama") as HTMLButtonElement).disabled).toBe(true);
    expect(within(card("Mama")).getByText("Sponsored")).toBeDefined();
    // The value cards come from the constants (bug 24).
    expect(screen.getByText("€50.00")).toBeDefined();
    expect(screen.getByText("5 sec")).toBeDefined();
    expect(screen.getByText("+€10.00")).toBeDefined();
    expect(screen.getByText("2 available gestures · 0 selected")).toBeDefined();
    fireEvent.click(card("Broer"));
    expect(card("Broer").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("selection-count").textContent).toBe(
      "1 gesture selected"
    );
    expect(screen.getByText("Total: €50.00")).toBeDefined();
  });

  test("preselects ?gesture= only when it is available", async () => {
    await renderSite(() => <Wizard preselect={["zus", "mama", "weg"]} />, {
      api: api(),
    });
    await waitFor(() =>
      expect(card("Zus").getAttribute("aria-pressed")).toBe("true")
    );
    expect(card("Mama").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("selection-count").textContent).toBe(
      "1 gesture selected"
    );
  });

  test("step 2: the live counter /35, and the VAT error on its field", async () => {
    await renderSite(() => <Wizard />, { api: api() });
    await chooseBroerAndZus();
    type(NAME_IN_THE_VIDEO, "Bakkerij");
    expect(screen.getByText("8/35")).toBeDefined();
    type(FULL_NAME, "Jan Jansen");
    type(EMAIL, "jan@voorbeeld.be");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "I want an invoice" })
    );
    // S-08: the invoice email starts as the contact email.
    expect(
      (screen.getByLabelText(INVOICE_EMAIL) as HTMLInputElement).value
    ).toBe("jan@voorbeeld.be");
    type(NAME_ON_THE_INVOICE, "Jansen BV");
    type(ENTERPRISE_NUMBER, "0123456789");
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to preview" })
    );
    const vat = screen.getByLabelText(ENTERPRISE_NUMBER);
    await waitFor(() => expect(vat.getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getByText("Invalid enterprise number.")).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Configure your sponsorship" })
    ).toBeDefined();
    // Fixed: on to the preview.
    type(ENTERPRISE_NUMBER, "BE 0123.456.749");
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to preview" })
    );
    await screen.findByRole("heading", { name: "Review your sponsorship" });
  });

  test("the logo: unticking keeps the price honest, and a GIF is refused on the field", async () => {
    await renderSite(() => <Wizard />, { api: api() });
    await chooseBroerAndZus();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Add a logo (+€10.00 per gesture)" })
    );
    expect(screen.getByTestId("price-total").textContent).toBe("€120.00");
    const input = screen.getByLabelText(LOGO) as HTMLInputElement;
    const gif = new File(["GIF89a"], "logo.gif", { type: "image/gif" });
    fireEvent.change(input, { target: { files: [gif] } });
    expect(
      await screen.findByText("Use a PNG, JPEG or WebP image.")
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Add a logo (+€10.00 per gesture)" })
    );
    expect(screen.getByTestId("price-total").textContent).toBe("€100.00");
  });

  test("pay: checkout, sponsorship_checkout_started, then the redirect", async () => {
    const { calls, events } = await renderSite(() => <Wizard />, {
      api: api({
        "sponsorships/checkout": (input: unknown) => ({
          checkoutUrl: "https://mollie.test/checkout/tr_1",
          paymentId: (input as { checkoutId: string }).checkoutId,
        }),
      }),
    });
    await chooseBroerAndZus();
    await fillDetails();
    expect(screen.getByTestId("review-total").textContent).toBe("€100.00");
    expect(screen.getAllByRole("img", { name: PREVIEW_FOR })).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to payment" })
    );
    await waitFor(() =>
      expect(redirects).toEqual(["https://mollie.test/checkout/tr_1"])
    );
    expect(events).toContainEqual({
      name: "sponsorship_checkout_started",
      properties: { gesture_count: 2, has_logo: false },
    });
    const sent = calls.find((call) => call.path === "sponsorships/checkout");
    expect(sent?.input).toMatchObject({
      contact: { email: "jan@voorbeeld.be", name: "Jan Jansen" },
      displayName: "Bakkerij Jansen",
      expectedTotalCents: 10_000,
      gestureIds: [ID(1), ID(2)],
      locale: "en",
    });
  });

  test("GESTURE_UNAVAILABLE sends the sponsor back to step 1 with that card marked", async () => {
    const { events } = await renderSite(() => <Wizard />, {
      api: api({
        "sponsorships/checkout": rpcError("GESTURE_UNAVAILABLE", 409, {
          gestureIds: [ID(2)],
        }),
      }),
    });
    await chooseBroerAndZus();
    await fillDetails();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to payment" })
    );
    await screen.findByRole("heading", { level: 1, name: "Support a gesture" });
    expect(screen.getByRole("alert").textContent).toContain(
      "Someone else was just ahead of you"
    );
    expect(card("Zus").getAttribute("data-state")).toBe("taken");
    expect((card("Zus") as HTMLButtonElement).disabled).toBe(true);
    expect(card("Broer").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("selection-count").textContent).toBe(
      "1 gesture selected"
    );
    expect(redirects).toEqual([]);
    expect(
      events.some((event) => event.name === "sponsorship_checkout_started")
    ).toBe(false);
  });

  test("another refusal stays on the step with its reason", async () => {
    await renderSite(() => <Wizard />, {
      api: api({
        "sponsorships/checkout": rpcError("INVALID_STATE", 409, {
          reason: "paymentProvider",
        }),
      }),
    });
    await chooseBroerAndZus();
    await fillDetails();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to payment" })
    );
    expect(
      await screen.findByText(
        "The payment could not be started. Nothing was charged. Please try again."
      )
    ).toBeDefined();
  });

  test("a paused checkout (no Mollie key) shows a calm notice from the start", async () => {
    await renderSite(() => <Wizard />, {
      api: api({ "sponsorships/availability": availability({}, false) }),
    });
    expect(
      await screen.findByRole("heading", {
        name: "Sponsoring is paused for now",
      })
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  test("caps the selection at 10 and explains why", async () => {
    const many = Array.from({ length: 11 }, (_, index) => ({
      ...GESTURES[0],
      id: `00000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`,
      name: `Gebaar ${index}`,
      slug: `gebaar-${index}`,
    }));
    await renderSite(() => <Wizard />, {
      api: api({
        "gestures/search": { items: many, total: many.length },
        "sponsorships/availability": availability(),
      }),
    });
    await waitFor(() =>
      expect(card("Gebaar 0").getAttribute("data-state")).toBe("available")
    );
    for (const gesture of many) {
      act(() => {
        fireEvent.click(card(gesture.name));
      });
    }
    expect(screen.getByTestId("selection-count").textContent).toBe(
      "10 gestures selected"
    );
    expect(
      screen.getByText(
        "You can sponsor up to 10 gestures per payment. Deselect one to choose another."
      )
    ).toBeDefined();
  });
});
