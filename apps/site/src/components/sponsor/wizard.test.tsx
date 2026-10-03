import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
  playbackId: `pb-${gesture.slug}`,
}));

/** `gestures.search` items carry their match. */
function searched<T>(items: T[]) {
  return items.map((item) => ({
    ...item,
    matchedField: null,
    matchType: null,
    score: 0,
  }));
}

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
    // The browse list (no query): keyset pages, as `gestures.list` answers.
    "gestures/list": { items: GESTURES, nextCursor: null },
    "gestures/search": { items: searched(GESTURES), total: GESTURES.length },
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

/** A card is a toggle named by its gesture (the badge is its description). */
function card(name: string): HTMLElement {
  return screen.getByRole("button", { name });
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

interface FakeTurnstile {
  callback?: (token: string) => void;
}
const widget: FakeTurnstile = {};

beforeEach(() => {
  // The Turnstile widget, as Cloudflare's script exposes it.
  window.turnstile = {
    remove: () => undefined,
    render: (_element, options) => {
      widget.callback = options.callback;
      return "widget-1";
    },
    reset: () => undefined,
  };
});

afterEach(() => {
  cleanup();
  redirects.length = 0;
  widget.callback = undefined;
});

function checkoutIds(calls: { input: unknown; path: string }[]): string[] {
  return calls
    .filter((call) => call.path === "sponsorships/checkout")
    .map((call) => (call.input as { checkoutId: string }).checkoutId);
}

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
    expect(
      screen.getByText("2 available gestures shown · 0 selected")
    ).toBeDefined();
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
    // Not a company name from the browser's autofill (review Minor 3).
    expect(
      screen.getByLabelText(NAME_IN_THE_VIDEO).getAttribute("autocomplete")
    ).toBe("off");
    // The price summary is a section of its own, not a part of Contact.
    expect(
      screen.getByRole("heading", { level: 2, name: "Price summary" })
    ).toBeDefined();
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
    const error = await screen.findByText("Use a PNG, JPEG or WebP image.");
    // The error sits right under the dropzone, before the guidelines, and
    // the Browse button (the real control) is described by it (Minors 4, 5).
    const guidelines = screen.getByText("Logo guidelines");
    expect(error.compareDocumentPosition(guidelines)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    const browse = screen.getByRole("button", { name: "Choose another logo" });
    expect(browse.getAttribute("aria-describedby")).toContain(error.id);
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
        "gestures/list": { items: many, nextCursor: null },
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

  test("a blocked card says why: its badge is the button's description (review I-5)", async () => {
    await renderSite(() => <Wizard />, { api: api() });
    await waitFor(() =>
      expect(card("Mama").getAttribute("data-state")).toBe("sponsored")
    );
    const describedBy = card("Mama").getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe("Sponsored");
    expect(card("Broer").getAttribute("aria-describedby")).toBeNull();
  });

  test("a chosen card that became blocked can still be deselected (review Minor 2)", async () => {
    // Preselected while available (its own read), pending by the grid's read.
    await renderSite(() => <Wizard preselect={["broer"]} />, {
      api: api({
        "sponsorships/availability": (input: unknown) => {
          const ids = (input as { gestureIds: string[] }).gestureIds;
          return {
            checkoutEnabled: true,
            items: ids.map((gestureId) => ({
              gestureId,
              state:
                gestureId === ID(1) && ids.length > 1 ? "pending" : "available",
            })),
          };
        },
      }),
    });
    await waitFor(() =>
      expect(card("Broer").getAttribute("aria-pressed")).toBe("true")
    );
    await waitFor(() =>
      expect(card("Broer").getAttribute("data-state")).toBe("pending")
    );
    expect((card("Broer") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(card("Broer"));
    expect(card("Broer").getAttribute("aria-pressed")).toBe("false");
    expect((card("Broer") as HTMLButtonElement).disabled).toBe(true);
  });

  test("browsing pages through every gesture with Load more (review I-1)", async () => {
    const page2 = Array.from({ length: 3 }, (_, index) => ({
      ...GESTURES[0],
      id: `00000000-0000-4000-8000-0000000002${String(index).padStart(2, "0")}`,
      name: `Later ${index}`,
      slug: `later-${index}`,
    }));
    const { calls } = await renderSite(() => <Wizard />, {
      api: api({
        "gestures/list": (input: unknown) =>
          (input as { cursor?: string }).cursor === "c2"
            ? { items: page2, nextCursor: null }
            : { items: GESTURES, nextCursor: "c2" },
        "sponsorships/availability": availability(),
      }),
    });
    await waitFor(() =>
      expect(card("Broer").getAttribute("data-state")).toBe("available")
    );
    expect(screen.queryByRole("button", { name: "Later 0" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(card("Later 2").getAttribute("data-state")).toBe("available")
    );
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(
      calls.filter((call) => call.path === "gestures/search")
    ).toHaveLength(0);
  });

  test("a search says when it shows only part of its matches (review I-1)", async () => {
    await renderSite(() => <Wizard />, {
      api: api({
        "gestures/search": { items: searched(GESTURES), total: 80 },
      }),
    });
    await waitFor(() =>
      expect(card("Broer").getAttribute("data-state")).toBe("available")
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "e" },
    });
    expect(
      await screen.findByText(
        "Showing 3 of 80 matches. Search more precisely to find the rest."
      )
    ).toBeDefined();
  });

  test("the count is announced once, by the selection bar (review Minor 6)", async () => {
    const { container } = { container: document.body };
    await renderSite(() => <Wizard />, { api: api() });
    await waitFor(() =>
      expect(card("Broer").getAttribute("data-state")).toBe("available")
    );
    const live = [...container.querySelectorAll("[aria-live]")].filter((node) =>
      node.textContent?.includes("selected")
    );
    expect(live).toHaveLength(1);
  });

  test("pays with a logo: upload, PUT, checkout with the key, has_logo true", async () => {
    const puts: { body: unknown; contentType: string | null; url: string }[] =
      [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("https://upload.test/")) {
        puts.push({
          body: init?.body,
          contentType: new Headers(init?.headers).get("content-type"),
          url,
        });
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return realFetch(input, init);
    }) as typeof fetch;
    try {
      const { calls, events } = await renderSite(() => <Wizard />, {
        api: api({
          "sponsorships/checkout": (input: unknown) => ({
            checkoutUrl: "https://mollie.test/checkout/tr_3",
            paymentId: (input as { checkoutId: string }).checkoutId,
          }),
          "sponsorships/uploadLogo": {
            expiresAt: Date.now() + 300_000,
            headers: { "content-type": "image/png" },
            key: "logos/0b6c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d",
            uploadUrl: "https://upload.test/logos/0b6c1d2e",
          },
        }),
      });
      await chooseBroerAndZus();
      fireEvent.click(
        screen.getByRole("checkbox", {
          name: "Add a logo (+€10.00 per gesture)",
        })
      );
      const png = new File([new Uint8Array(64)], "logo.png", {
        type: "image/png",
      });
      fireEvent.change(screen.getByLabelText(LOGO), {
        target: { files: [png] },
      });
      await fillDetails();
      fireEvent.click(
        screen.getByRole("button", { name: "Continue to payment" })
      );
      await waitFor(() =>
        expect(redirects).toEqual(["https://mollie.test/checkout/tr_3"])
      );
      expect(puts).toEqual([
        {
          body: png,
          contentType: "image/png",
          url: "https://upload.test/logos/0b6c1d2e",
        },
      ]);
      expect(
        calls.find((call) => call.path === "sponsorships/uploadLogo")?.input
      ).toEqual({ contentType: "image/png", size: 64 });
      expect(
        calls.find((call) => call.path === "sponsorships/checkout")?.input
      ).toMatchObject({
        expectedTotalCents: 12_000,
        logoKey: "logos/0b6c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d",
      });
      expect(events).toContainEqual({
        name: "sponsorship_checkout_started",
        properties: { gesture_count: 2, has_logo: true },
      });
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("sends the Turnstile token with the checkout, then needs a fresh one", async () => {
    const { headers } = await renderSite(
      () => (
        <div data-testid="page">
          <SponsorWizard
            preselect={[]}
            redirect={pushRedirect}
            turnstileSiteKey="site-key"
          />
        </div>
      ),
      {
        api: api({
          "sponsorships/checkout": rpcError("TURNSTILE_FAILED", 403),
        }),
      }
    );
    await chooseBroerAndZus();
    await fillDetails();
    const pay = screen.getByRole("button", { name: "Continue to payment" });
    expect((pay as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(widget.callback).toBeDefined());
    act(() => widget.callback?.("widget-token"));
    await waitFor(() =>
      expect((pay as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(pay);
    expect(
      await screen.findByText("The security check failed. Please try again.")
    ).toBeDefined();
    expect(
      headers
        .find((entry) => entry.path === "sponsorships/checkout")
        ?.headers.get("x-turnstile-token")
    ).toBe("widget-token");
    // Single use: Pay waits for the next token.
    expect(
      (
        screen.getByRole("button", {
          name: "Continue to payment",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  test("a provider failure takes a new checkout id for the next try (ruling 5)", async () => {
    let answer: unknown = rpcError("INVALID_STATE", 409, {
      reason: "paymentProvider",
    });
    const { calls } = await renderSite(() => <Wizard />, {
      api: api({ "sponsorships/checkout": () => answer }),
    });
    await chooseBroerAndZus();
    await fillDetails();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to payment" })
    );
    await screen.findByText(
      "The payment could not be started. Nothing was charged. Please try again."
    );
    answer = {
      checkoutUrl: "https://mollie.test/checkout/tr_4",
      paymentId: ID(9),
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to payment" })
    );
    await waitFor(() => expect(redirects).toHaveLength(1));
    const [first, second] = checkoutIds(calls);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
  });

  test("a network failure keeps the id; an edit after it takes a new one (review I-2)", async () => {
    let answer: unknown = rpcError("INTERNAL_SERVER_ERROR", 500);
    const { calls } = await renderSite(() => <Wizard />, {
      api: api({ "sponsorships/checkout": () => answer }),
    });
    await chooseBroerAndZus();
    await fillDetails();
    const pay = () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Continue to payment" })
      );
    pay();
    await screen.findByText("Continuing to payment failed. Please try again.");
    pay();
    await waitFor(() => expect(checkoutIds(calls)).toHaveLength(2));
    // Back to the details, a new name, and pay again: a different payment.
    fireEvent.click(screen.getByRole("button", { name: "Back to details" }));
    type(NAME_IN_THE_VIDEO, "Bakkerij Peeters");
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to preview" })
    );
    await screen.findByRole("heading", { name: "Review your sponsorship" });
    answer = {
      checkoutUrl: "https://mollie.test/checkout/tr_5",
      paymentId: ID(8),
    };
    pay();
    await waitFor(() => expect(redirects).toHaveLength(1));
    const [first, retry, edited] = checkoutIds(calls);
    expect(retry).toBe(first);
    expect(edited).not.toBe(first);
  });

  test("Pay cannot run twice while the browser leaves for Mollie (review I-9)", async () => {
    const { calls, events } = await renderSite(() => <Wizard />, {
      api: api({
        "sponsorships/checkout": (input: unknown) => ({
          checkoutUrl: "https://mollie.test/checkout/tr_6",
          paymentId: (input as { checkoutId: string }).checkoutId,
        }),
      }),
    });
    await chooseBroerAndZus();
    await fillDetails();
    const pay = screen.getByRole("button", { name: "Continue to payment" });
    fireEvent.click(pay);
    await waitFor(() => expect(redirects).toHaveLength(1));
    fireEvent.click(pay);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(checkoutIds(calls)).toHaveLength(1);
    expect(
      events.filter((event) => event.name === "sponsorship_checkout_started")
    ).toHaveLength(1);
    // Back from Mollie through the bfcache: Pay works again.
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event("pageshow"), { persisted: true })
      );
    });
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Continue to payment",
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false)
    );
  });

  test("a paused wizard is the page's h1 (review I-3)", async () => {
    await renderSite(() => <Wizard />, {
      api: api({ "sponsorships/availability": availability({}, false) }),
    });
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Sponsoring is paused for now",
      })
    ).toBeDefined();
  });
});
