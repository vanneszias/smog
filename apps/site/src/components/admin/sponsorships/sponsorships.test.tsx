import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { ORPCError } from "@orpc/client";
import type {
  AdminPayment,
  AdminSponsorshipDetail,
  AdminSponsorshipPage,
  AdminSponsorshipRow,
} from "@smog/admin/schema";
import { SPONSORSHIP_STATUSES } from "@smog/db/enums";
import { createI18n, dayRange, LOCALES } from "@smog/i18n";
import { INVALID_STATE_REASONS } from "@smog/sponsorships/schema";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import type { SponsorshipSearch } from "./search";

// mux-player needs a real browser.
mock.module("@mux/mux-player-react", () => ({
  default: (): ReactNode => <div data-testid="mux" />,
}));

const { renderSite, rpcError } = await import("@/test/render");
const { ExportDialog } = await import("./export-dialog");
const { sponsorshipActionError } = await import("./labels");
const { ModerationQueue } = await import("./moderation-queue");
const { SponsorshipDetail } = await import("./sponsorship-detail");
const { sponsorshipListInput, validateSponsorshipSearch } = await import(
  "./search"
);
const { StatusBadge } = await import("./status-badge");
const { SponsorshipTable } = await import("./sponsorship-table");

const HOND = /Hond/;
const REVIEW_TAB = /Review/;
const REFUND_TAB = /Refund needed/;
const ALL_TAB = /All/;
const OPEN_IN_MOLLIE = /Open in Mollie/;
const REASON = /Reason/;
const BANK_REFERENCE = /Bank reference/;
const TYPE_HOND = /Type Hond/;
const CHECKOUT_PAYMENT = /Checkout payment/;
const DAY = 86_400_000;
const CREATED = Date.UTC(2026, 8, 20, 9, 30);
const REEDIT_URL =
  "https://smog.test/sponsor/edit?token=e2eFakeTokenForTheAdminDialog_0123456789ab";

function payment(patch: Partial<AdminPayment> = {}): AdminPayment {
  return {
    amountCents: 6000,
    chargedBackAt: null,
    chargedBackCents: 0,
    createdAt: CREATED,
    id: "pay-1",
    items: [
      {
        amountCents: 6000,
        gesture: { id: "g-hond", name: "Hond", slug: "hond" },
        includesLogo: true,
        sponsorshipId: "sp-1",
        status: "in_review",
      },
    ],
    kind: "initial",
    mollieDashboardUrl: "https://my.mollie.com/dashboard/payments/tr_abc123",
    mollieId: "tr_abc123",
    paidAt: CREATED + 60_000,
    refunded: false,
    refundedAt: null,
    refundedCents: 0,
    status: "paid",
    ...patch,
  };
}

function detail(
  patch: Partial<AdminSponsorshipDetail> = {},
  sponsorship: Partial<AdminSponsorshipDetail["sponsorship"]> = {}
): AdminSponsorshipDetail {
  return {
    events: [
      {
        actor: null,
        createdAt: CREATED,
        data: { paymentId: "pay-1" },
        id: "ev-1",
        type: "created",
      },
      {
        actor: { id: "u-admin", name: "Ada Admin" },
        createdAt: CREATED + DAY,
        data: { reason: "Logo is blurry" },
        id: "ev-2",
        type: "rejected",
      },
    ],
    gesture: {
      id: "g-hond",
      name: "Hond",
      playbackId: "original-playback",
      slug: "hond",
    },
    invoice: {
      email: "factuur@acme.test",
      name: "Acme BV",
      vatNumber: "0123456749",
    },
    logoUrl: "/api/logos/0b5c9c3e-6d1f-4c39-a7d2-2f7e5d1c9a10",
    payments: [payment()],
    renderJobs: [
      {
        attempt: 1,
        createdAt: CREATED + 120_000,
        error: null,
        finishedAt: CREATED + 180_000,
        id: "job-1",
        playbackId: "original-playback",
        status: "succeeded",
      },
    ],
    sponsor: {
      company: "Acme BV",
      email: "alex@acme.test",
      locale: "nl",
      name: "Alex Sponsor",
    },
    sponsorship: {
      createdAt: CREATED,
      displayName: "Bakkerij Zon",
      endsAt: null,
      hasLogo: true,
      id: "sp-1",
      reminderSentAt: null,
      startsAt: null,
      status: "in_review",
      updatedAt: CREATED,
      ...sponsorship,
    },
    tokens: [],
    video: { fakeRender: true, playbackId: "original-playback" },
    ...patch,
  };
}

function row(patch: Partial<AdminSponsorshipRow> = {}): AdminSponsorshipRow {
  return {
    amountCents: 6000,
    createdAt: CREATED,
    displayName: "Bakkerij Zon",
    endsAt: null,
    gesture: { id: "g-hond", name: "Hond", slug: "hond" },
    hasLogo: true,
    id: "sp-1",
    invoiceRequested: true,
    paymentStatus: "paid",
    playbackId: "original-playback",
    refundNeeded: false,
    sponsor: { company: null, email: "alex@acme.test", name: "Alex" },
    startsAt: null,
    status: "in_review",
    updatedAt: CREATED,
    ...patch,
  };
}

function page(items: AdminSponsorshipRow[]): AdminSponsorshipPage {
  const counts: AdminSponsorshipPage["counts"] = {
    awaiting_payment: 0,
    cancelled: 0,
    changes_requested: 0,
    expired: 0,
    expiring: 0,
    in_review: 0,
    live: 0,
    rejected: 0,
    render_failed: 0,
    rendering: 0,
  };
  for (const item of items) {
    counts[item.status] += 1;
  }
  return { counts, items, nextCursor: null };
}

function detailPage(): () => ReactNode {
  return function Page(): ReactNode {
    return (
      <div data-testid="page">
        <SponsorshipDetail id="sp-1" />
      </div>
    );
  };
}

/** The text of the elements an element's `aria-describedby` names. */
function describedBy(element: Element): string {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

function button(name: string | RegExp): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

async function showDetail(
  data: AdminSponsorshipDetail,
  api: Record<string, unknown> = {}
) {
  const site = await renderSite(detailPage(), {
    api: { "admin/sponsorships/get": data, ...api },
  });
  await screen.findByRole("heading", { level: 1, name: "Bakkerij Zon" });
  return site;
}

describe("sponsorship labels", () => {
  test("every status, refusal and code has a label in every locale", () => {
    for (const locale of LOCALES) {
      const { t } = createI18n(locale);
      for (const reason of INVALID_STATE_REASONS) {
        const message = sponsorshipActionError(
          t,
          new ORPCError("INVALID_STATE", { data: { reason } })
        );
        expect(message, `${locale} ${reason}`).not.toContain("sponsorship.");
      }
      for (const code of ["NOT_FOUND", "VALIDATION", "OTHER"]) {
        expect(
          sponsorshipActionError(t, new ORPCError(code)),
          `${locale} ${code}`
        ).not.toContain("admin.");
      }
    }
  });

  test("the status badge reads the shared label map", async () => {
    await renderSite(function Page(): ReactNode {
      return (
        <div data-testid="page">
          {SPONSORSHIP_STATUSES.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
      );
    });
    for (const label of ["In review", "Live", "Video failed", "Expired"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});

describe("sponsorship search", () => {
  test("keeps valid values only, and sets every key", () => {
    expect(
      validateSponsorshipSearch({
        cursor: "abc",
        extra: "x",
        from: "2026-09-01",
        payment: "pay-1",
        q: " zon ",
        status: "live",
        tab: "all",
        to: "nope",
      })
    ).toEqual({
      cursor: "abc",
      from: "2026-09-01",
      payment: "pay-1",
      q: " zon ",
      status: "live",
      tab: "all",
      to: undefined,
    });
    expect(
      validateSponsorshipSearch({ status: "paid", tab: "queue" })
    ).toMatchObject({ status: undefined, tab: undefined });
  });

  test("opens on the Review tab (in review), and maps every tab", () => {
    expect(sponsorshipListInput({})).toEqual({ status: ["in_review"] });
    expect(sponsorshipListInput({ tab: "rendering" }).status).toEqual([
      "rendering",
      "render_failed",
    ]);
    expect(sponsorshipListInput({ tab: "live" }).status).toEqual([
      "live",
      "expiring",
    ]);
    expect(sponsorshipListInput({ tab: "closed" }).status).toEqual([
      "rejected",
      "cancelled",
      "expired",
    ]);
    expect(sponsorshipListInput({ tab: "awaiting" }).status).toEqual([
      "awaiting_payment",
    ]);
    expect(sponsorshipListInput({ tab: "refund" })).toEqual({
      refundNeeded: true,
    });
    // The status select narrows only the All tab.
    expect(sponsorshipListInput({ status: "live", tab: "all" })).toEqual({
      status: ["live"],
    });
    expect(
      sponsorshipListInput({ status: "live", tab: "review" }).status
    ).toEqual(["in_review"]);
  });

  test("turns the Brussels days, the search and the cursor into the input", () => {
    expect(
      sponsorshipListInput({
        cursor: "c1",
        from: "2026-09-30",
        payment: "pay-1",
        q: "  zon ",
        tab: "all",
        to: "2026-09-01",
      })
    ).toEqual({
      cursor: "c1",
      // A reversed range is swapped.
      from: dayRange("2026-09-01")?.start,
      paymentId: "pay-1",
      q: "zon",
      to: dayRange("2026-09-30")?.end,
    });
  });
});

describe("ModerationQueue", () => {
  test("cards link to the detail with the gesture, name, amount and invoice flag", async () => {
    await renderSite(function Page(): ReactNode {
      return (
        <div data-testid="page">
          <ModerationQueue rows={[row()]} />
        </div>
      );
    });
    const card = screen.getByRole("link", { name: HOND });
    expect(card.getAttribute("href")).toBe("/admin/sponsorships/sp-1");
    expect(card.textContent).toContain("Bakkerij Zon");
    expect(card.textContent).toContain("€60.00");
    expect(card.textContent).toContain("Invoice requested");
  });

  test("an empty queue is all caught up", async () => {
    await renderSite(function Page(): ReactNode {
      return (
        <div data-testid="page">
          <ModerationQueue rows={[]} />
        </div>
      );
    });
    expect(screen.getByRole("heading", { name: "All caught up" })).toBeTruthy();
  });
});

describe("SponsorshipTable", () => {
  function TablePage(): ReactNode {
    const [search, setSearch] = useState<SponsorshipSearch>({});
    return (
      <div data-testid="page">
        <SponsorshipTable onSearchChange={setSearch} search={search} />
      </div>
    );
  }

  test("opens on the Review tab with its count; All is a table of every status", async () => {
    const site = await renderSite(TablePage, {
      api: {
        "admin/sponsorships/list": (input: {
          refundNeeded?: boolean;
          status?: string[];
        }) => {
          if (input.refundNeeded) {
            return page([row({ id: "sp-r", status: "cancelled" })]);
          }
          if (input.status?.[0] === "in_review") {
            return page([row()]);
          }
          return page([row(), row({ id: "sp-2", status: "live" })]);
        },
      },
    });
    const review = await screen.findByRole("tab", { name: REVIEW_TAB });
    expect(review.getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(review.textContent).toBe("Review1"));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: REFUND_TAB }).textContent).toBe(
        "Refund needed1"
      )
    );
    expect(
      (await screen.findByRole("link", { name: HOND })).getAttribute("href")
    ).toBe("/admin/sponsorships/sp-1");

    fireEvent.mouseDown(screen.getByRole("tab", { name: ALL_TAB }));
    const table = await screen.findByRole("table", { name: "Sponsorships" });
    await waitFor(() =>
      expect(within(table).getAllByRole("row")).toHaveLength(3)
    );
    expect(table.textContent).toContain("Live");
    const listCalls = site.calls.filter(
      (call) => call.path === "admin/sponsorships/list"
    );
    // The All tab lists every status (the counts ask for one row).
    expect(listCalls.map((call) => call.input)).toContainEqual({});
  });
});

describe("SponsorshipTable, empty", () => {
  test("an empty tab is an empty state, not an empty table", async () => {
    await renderSite(
      function Page(): ReactNode {
        const [search, setSearch] = useState<SponsorshipSearch>({
          tab: "closed",
        });
        return (
          <div data-testid="page">
            <SponsorshipTable onSearchChange={setSearch} search={search} />
          </div>
        );
      },
      { api: { "admin/sponsorships/list": page([]) } }
    );
    await screen.findByRole("heading", { name: "No sponsorships found." });
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("SponsorshipDetail", () => {
  test("in review: approve, request changes and reject; the payment's Mollie link", async () => {
    await showDetail(detail());
    for (const name of ["Approve", "Request changes", "Reject"]) {
      expect(button(name).disabled).toBe(false);
    }
    for (const name of ["Mark paid", "Cancel payment", "End now"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    const mollie = screen.getByRole("link", { name: OPEN_IN_MOLLIE });
    expect(mollie.getAttribute("href")).toBe(
      "https://my.mollie.com/dashboard/payments/tr_abc123"
    );
    // The logo is the admin read of the stored logo.
    const logo = screen.getByRole("img", { name: "Logo of Bakkerij Zon" });
    expect(logo.getAttribute("src")).toBe(
      "/api/logos/0b5c9c3e-6d1f-4c39-a7d2-2f7e5d1c9a10"
    );
    expect(screen.getByText("Invoice requested")).toBeTruthy();
    expect(screen.getByText("Fake render (no overlay)")).toBeTruthy();
    // The trail names the actor, the system, and the reason.
    const trail = screen.getByRole("list", { name: "History" });
    expect(trail.textContent).toContain("Ada Admin");
    expect(trail.textContent).toContain("System");
    expect(trail.textContent).toContain("Logo is blurry");
  });

  test("approve is refused without a video, and says why", async () => {
    await showDetail(
      detail({ video: { fakeRender: false, playbackId: null } })
    );
    const approve = button("Approve");
    expect(approve.disabled).toBe(true);
    expect(describedBy(approve)).toContain("no video yet");
  });

  test("a refused approve shows the reason", async () => {
    await showDetail(detail(), {
      "admin/sponsorships/approve": rpcError("INVALID_STATE", 409, {
        reason: "noVideo",
      }),
    });
    fireEvent.click(button("Approve"));
    const alert = await screen.findByRole("alertdialog");
    expect(alert.textContent).toContain("Hond");
    expect(alert.textContent).toContain("€60.00");
    fireEvent.click(within(alert).getByRole("button", { name: "Approve" }));
    await screen.findByText("The video is not ready yet.");
  });

  test("request changes shows the link once, with Copy and the expiry", async () => {
    const expiresAt = Date.UTC(2026, 9, 10, 12, 0);
    const site = await showDetail(detail(), {
      "admin/sponsorships/requestChanges": { expiresAt, url: REEDIT_URL },
    });
    fireEvent.click(button("Request changes"));
    const alert = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(alert).getByRole("button", { name: "Request changes" })
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Edit link for Bakkerij Zon",
    });
    const link = within(dialog).getByRole("textbox", {
      name: "Link",
    }) as HTMLInputElement;
    expect(link.value).toBe(REEDIT_URL);
    expect(dialog.textContent).toContain("10 October 2026");
    expect(
      site.calls.find(
        (call) => call.path === "admin/sponsorships/requestChanges"
      )?.input
    ).toEqual({ id: "sp-1" });

    const written: string[] = [];
    const clipboard = { writeText: (text: string) => written.push(text) };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          clipboard.writeText(text);
          return Promise.resolve();
        },
      },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(written).toEqual([REEDIT_URL]));

    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Shown once: nothing on the page holds the link any more.
    expect(document.body.innerHTML).not.toContain("e2eFakeToken");
  });

  test("reject needs a reason: the confirm is off while it is blank", async () => {
    const site = await showDetail(detail(), {
      "admin/sponsorships/reject": { id: "sp-1", status: "rejected" },
    });
    fireEvent.click(button("Reject"));
    const alert = await screen.findByRole("alertdialog");
    expect(alert.textContent).toContain("Bakkerij Zon");
    expect(alert.textContent).toContain("€60.00");
    const confirm = within(alert).getByRole("button", {
      name: "Reject",
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    const reason = within(alert).getByRole("textbox", { name: REASON });
    fireEvent.change(reason, { target: { value: "   " } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(reason, { target: { value: "Not a real company" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await screen.findByText("Bakkerij Zon is rejected.");
    expect(
      site.calls.find((call) => call.path === "admin/sponsorships/reject")
        ?.input
    ).toEqual({ id: "sp-1", reason: "Not a real company" });
  });

  test("awaiting payment: mark paid and cancel name every gesture and the amount", async () => {
    const open = payment({
      amountCents: 12_000,
      items: [
        {
          amountCents: 6000,
          gesture: { id: "g-hond", name: "Hond", slug: "hond" },
          includesLogo: true,
          sponsorshipId: "sp-1",
          status: "awaiting_payment",
        },
        {
          amountCents: 6000,
          gesture: { id: "g-kat", name: "Kat", slug: "kat" },
          includesLogo: true,
          sponsorshipId: "sp-2",
          status: "awaiting_payment",
        },
      ],
      paidAt: null,
      status: "open",
    });
    const site = await showDetail(
      detail({ payments: [open] }, { status: "awaiting_payment" }),
      {
        "admin/sponsorships/markPaid": {
          paymentId: "pay-1",
          result: "marked_paid",
          sponsorshipIds: ["sp-1", "sp-2"],
        },
      }
    );
    for (const name of ["Approve", "Reject", "End now"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    fireEvent.click(button("Cancel payment"));
    let alert = await screen.findByRole("alertdialog");
    expect(alert.textContent).toContain("€120.00");
    expect(alert.textContent).toContain("Hond and Kat");
    fireEvent.click(within(alert).getByRole("button", { name: "Keep it" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    fireEvent.click(button("Mark paid"));
    alert = await screen.findByRole("alertdialog");
    expect(alert.textContent).toContain("€120.00");
    expect(alert.textContent).toContain("Hond and Kat");
    fireEvent.change(
      within(alert).getByRole("textbox", { name: BANK_REFERENCE }),
      { target: { value: "BE-REF-42" } }
    );
    fireEvent.click(within(alert).getByRole("button", { name: "Mark paid" }));
    await screen.findByText("Marked paid. The videos are being made.");
    expect(
      site.calls.find((call) => call.path === "admin/sponsorships/markPaid")
        ?.input
    ).toEqual({ note: "BE-REF-42", paymentId: "pay-1" });
  });

  test("mark paid that fails after the payment was marked paid says so", async () => {
    let reads = 0;
    const open = payment({ paidAt: null, status: "open" });
    await showDetail(
      detail({ payments: [open] }, { status: "awaiting_payment" }),
      {
        "admin/sponsorships/get": () => {
          reads += 1;
          return reads === 1
            ? detail({ payments: [open] }, { status: "awaiting_payment" })
            : detail({ payments: [payment()] }, { status: "rendering" });
        },
        "admin/sponsorships/markPaid": rpcError("INTERNAL_SERVER_ERROR", 500),
      }
    );
    fireEvent.click(button("Mark paid"));
    const alert = await screen.findByRole("alertdialog");
    fireEvent.click(within(alert).getByRole("button", { name: "Mark paid" }));
    await screen.findByText(
      "The payment is marked paid, but starting the videos failed. The hourly check starts them; nothing else is needed."
    );
  });

  test("Mollie already had the money: settled, or flagged for a refund", async () => {
    const open = payment({ paidAt: null, status: "open" });
    await showDetail(
      detail({ payments: [open] }, { status: "awaiting_payment" }),
      {
        "admin/sponsorships/markPaid": {
          paymentId: "pay-1",
          result: "refund_needed",
          sponsorshipIds: ["sp-1"],
        },
      }
    );
    fireEvent.click(button("Mark paid"));
    const alert = await screen.findByRole("alertdialog");
    fireEvent.click(within(alert).getByRole("button", { name: "Mark paid" }));
    await screen.findByText(
      "Mollie already had this payment, but it needs a refund. Check the payment below."
    );
  });

  test("live: end now needs the gesture name typed", async () => {
    const site = await showDetail(
      detail(
        {},
        {
          endsAt: CREATED + 365 * DAY,
          startsAt: CREATED,
          status: "live",
        }
      ),
      {
        "admin/sponsorships/forceExpire": { id: "sp-1", status: "expired" },
      }
    );
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    fireEvent.click(button("End now"));
    const alert = await screen.findByRole("alertdialog");
    const confirm = within(alert).getByRole("button", {
      name: "End now",
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    const field = within(alert).getByRole("textbox", { name: TYPE_HOND });
    fireEvent.change(field, { target: { value: "hon" } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(field, { target: { value: "hond" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await screen.findByText("Bakkerij Zon has ended.");
    expect(
      site.calls.find((call) => call.path === "admin/sponsorships/forceExpire")
        ?.input
    ).toEqual({ confirmName: "hond", id: "sp-1" });
  });

  test("expiring: a new renewal link; changes requested: a new edit link", async () => {
    await showDetail(
      detail({}, { endsAt: CREATED + 20 * DAY, status: "expiring" })
    );
    expect(button("New renewal link")).toBeTruthy();
    expect(button("End now")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New edit link" })).toBeNull();
  });

  test("changes requested: reject and a new edit link, never the token", async () => {
    await showDetail(
      detail(
        {
          tokens: [
            {
              createdAt: CREATED,
              expiresAt: CREATED + 7 * DAY,
              id: "tok-1",
              purpose: "reedit",
              usedAt: null,
            },
          ],
        },
        { status: "changes_requested" }
      )
    );
    expect(button("Reject")).toBeTruthy();
    expect(button("New edit link")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    const tokens = screen.getByRole("region", { name: "Links" });
    expect(tokens.textContent).toContain("Edit link");
    expect(tokens.textContent).not.toContain("tok-1");
  });

  test("a refunded payment, a chargeback and record refund", async () => {
    const site = await showDetail(
      detail({
        payments: [
          payment({
            chargedBackAt: CREATED + 2 * DAY,
            chargedBackCents: 6000,
            status: "refund_needed",
          }),
        ],
      }),
      {
        "admin/sponsorships/recordRefund": {
          amountCents: 6000,
          paymentId: "pay-1",
          refundedCents: 6000,
        },
      }
    );
    const card = screen.getByRole("region", { name: CHECKOUT_PAYMENT });
    expect(card.textContent).toContain("Charged back");
    expect(card.textContent).toContain("only cancels open payments");
    fireEvent.click(
      within(card).getByRole("button", { name: "Record refund" })
    );
    const alert = await screen.findByRole("alertdialog");
    expect(alert.textContent).toContain("€60.00");
    expect(alert.textContent).toContain("Refund in the Mollie dashboard first");
    fireEvent.click(
      within(alert).getByRole("button", { name: "Record refund" })
    );
    await screen.findByText("Refund of €60.00 recorded.");
    expect(
      site.calls.find((call) => call.path === "admin/sponsorships/recordRefund")
        ?.input
    ).toEqual({ paymentId: "pay-1" });
  });

  test("a fully refunded payment reads Refunded, with no record button", async () => {
    await showDetail(
      detail({
        payments: [
          payment({
            refunded: true,
            refundedAt: CREATED + DAY,
            refundedCents: 6000,
            status: "refund_needed",
          }),
        ],
      })
    );
    const card = screen.getByRole("region", { name: CHECKOUT_PAYMENT });
    expect(within(card).getByText("Refunded")).toBeTruthy();
    expect(
      within(card).queryByRole("button", { name: "Record refund" })
    ).toBeNull();
  });

  test("an unknown sponsorship is not found", async () => {
    await renderSite(detailPage(), {
      api: { "admin/sponsorships/get": rpcError("NOT_FOUND", 404) },
    });
    await screen.findByRole("heading", {
      name: "This sponsorship does not exist",
    });
  });
});

describe("ExportDialog", () => {
  const created: Blob[] = [];
  let clicked: string[] = [];
  let createSpy: ReturnType<typeof spyOn>;
  let clickSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    created.length = 0;
    clicked = [];
    createSpy = spyOn(URL, "createObjectURL").mockImplementation(
      (blob: Blob | MediaSource) => {
        created.push(blob as Blob);
        return "blob:export";
      }
    );
    spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    clickSpy = spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function (this: HTMLAnchorElement) {
        clicked.push(this.download);
      }
    );
  });

  afterEach(() => {
    createSpy.mockRestore();
    clickSpy.mockRestore();
  });

  test("exports the chosen status and days, then downloads the file with its BOM", async () => {
    const csv = '﻿"ID","Status"\r\n';
    const site = await renderSite(
      function Page(): ReactNode {
        return (
          <div data-testid="page">
            <ExportDialog from="2026-09-01" to="2026-09-30" />
          </div>
        );
      },
      {
        api: {
          "admin/export/sponsorshipsCsv": {
            csv,
            filename: "sponsorships-2026-10-03.csv",
            rows: 0,
          },
        },
      }
    );
    fireEvent.click(button("Export CSV"));
    const dialog = await screen.findByRole("dialog", { name: "Export CSV" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Download" }));
    await waitFor(() =>
      expect(clicked).toEqual(["sponsorships-2026-10-03.csv"])
    );
    expect(
      site.calls.find((call) => call.path === "admin/export/sponsorshipsCsv")
        ?.input
    ).toEqual({
      from: dayRange("2026-09-01")?.start,
      to: dayRange("2026-09-30")?.end,
    });
    const bytes = new Uint8Array(await (created[0] as Blob).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    await screen.findByText("Exported 0 rows.");
  });

  test("too many rows asks for a shorter range", async () => {
    await renderSite(
      function Page(): ReactNode {
        return (
          <div data-testid="page">
            <ExportDialog />
          </div>
        );
      },
      {
        api: {
          "admin/export/sponsorshipsCsv": rpcError("INVALID_STATE", 409, {
            reason: "tooMany",
          }),
        },
      }
    );
    fireEvent.click(button("Export CSV"));
    const dialog = await screen.findByRole("dialog", { name: "Export CSV" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Download" }));
    await screen.findByText(
      "Too many rows to export. Choose a shorter date range."
    );
    expect(clicked).toEqual([]);
  });
});
