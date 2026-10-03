import { describe, expect, test } from "bun:test";
import { MAX_GESTURES_PER_CHECKOUT } from "@smog/config/constants";
import { checkoutInputSchema } from "../schema/wizard";
import {
  checkoutInput,
  createWizardState,
  type PreselectGesture,
  validateDetails,
  type WizardDetails,
  type WizardGesture,
  type WizardState,
  wizardPrice,
  wizardReducer,
} from "./use-checkout";

const CHECKOUT_ID = "8c3c5a52-7a0c-4d9b-9d65-1f1d7f0c2a11";

function gesture(index: number): WizardGesture {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `Gebaar ${index}`,
    playbackId: `pb-${index}`,
    slug: `gebaar-${index}`,
  };
}

function withSelection(count: number): WizardState {
  let state = createWizardState(CHECKOUT_ID);
  for (let index = 0; index < count; index += 1) {
    state = wizardReducer(state, { gesture: gesture(index), type: "toggle" });
  }
  return state;
}

const VALID_DETAILS: WizardDetails = {
  company: "",
  contactEmail: "jan@voorbeeld.be",
  contactName: "Jan Jansen",
  displayName: "Bakkerij Jansen",
  includeLogo: false,
  invoiceEmail: "",
  invoiceName: "",
  vatNumber: "",
  wantsInvoice: false,
};

function png(size = 1024): Blob {
  return new Blob([new Uint8Array(size)], { type: "image/png" });
}

describe("the wizard reducer (S-01, S-03)", () => {
  test("toggles a gesture in and out of the selection", () => {
    const one = withSelection(1);
    expect(one.selected.map((item) => item.id)).toEqual([gesture(0).id]);
    const none = wizardReducer(one, { gesture: gesture(0), type: "toggle" });
    expect(none.selected).toEqual([]);
  });

  test("caps the selection at 10 and says so", () => {
    const full = withSelection(MAX_GESTURES_PER_CHECKOUT);
    expect(full.selected).toHaveLength(MAX_GESTURES_PER_CHECKOUT);
    expect(full.limitReached).toBe(false);
    const over = wizardReducer(full, { gesture: gesture(99), type: "toggle" });
    expect(over.selected).toHaveLength(MAX_GESTURES_PER_CHECKOUT);
    expect(over.selected.some((item) => item.id === gesture(99).id)).toBe(
      false
    );
    expect(over.limitReached).toBe(true);
    // Deselecting one clears the explanation and makes room.
    const room = wizardReducer(over, { gesture: gesture(3), type: "toggle" });
    expect(room.limitReached).toBe(false);
    expect(room.selected).toHaveLength(MAX_GESTURES_PER_CHECKOUT - 1);
  });

  test("preselects only when the selection is empty, and only available gestures", () => {
    const candidates: PreselectGesture[] = [
      { ...gesture(1), state: "available" },
      { ...gesture(2), state: "sponsored" },
      { ...gesture(3), state: "pending" },
      { ...gesture(4), state: "unavailable" },
    ];
    const empty = createWizardState(CHECKOUT_ID);
    const preselected = wizardReducer(empty, {
      gestures: candidates,
      type: "preselect",
    });
    expect(preselected.selected.map((item) => item.id)).toEqual([
      gesture(1).id,
    ]);

    const chosen = withSelection(1);
    const kept = wizardReducer(chosen, {
      gestures: [{ ...gesture(5), state: "available" }],
      type: "preselect",
    });
    expect(kept).toBe(chosen);
  });

  test("preselects at most 10", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      ...gesture(index),
      state: "available" as const,
    }));
    const state = wizardReducer(createWizardState(CHECKOUT_ID), {
      gestures: many,
      type: "preselect",
    });
    expect(state.selected).toHaveLength(MAX_GESTURES_PER_CHECKOUT);
  });

  test("toggling the logo off keeps the file but does not send it", () => {
    let state = withSelection(2);
    state = wizardReducer(state, {
      patch: { ...VALID_DETAILS, includeLogo: true },
      type: "details",
    });
    const file = png();
    state = wizardReducer(state, { logo: file, type: "logo" });
    expect(wizardPrice(state)?.totalCents).toBe(2 * 6000);
    expect(
      checkoutInput(state, { locale: "nl", logoKey: "logos/k" }).logoKey
    ).toBe("logos/k");

    state = wizardReducer(state, {
      patch: { includeLogo: false },
      type: "details",
    });
    expect(state.logo).toBe(file);
    expect(wizardPrice(state)?.totalCents).toBe(2 * 5000);
    const input = checkoutInput(state, { locale: "nl", logoKey: "logos/k" });
    expect(input.logoKey).toBeUndefined();

    // Back on: the same file, no second choice needed.
    state = wizardReducer(state, {
      patch: { includeLogo: true },
      type: "details",
    });
    expect(state.logo).toBe(file);
    expect(validateDetails(state.details, state.logo)).toEqual({});
  });

  test("GESTURE_UNAVAILABLE goes back to step 1 with those gestures marked", () => {
    let state = withSelection(3);
    state = wizardReducer(state, { step: 2, type: "step" });
    state = wizardReducer(state, {
      gestureIds: [gesture(1).id],
      type: "unavailable",
    });
    expect(state.step).toBe(0);
    expect(state.selected.map((item) => item.id)).toEqual([
      gesture(0).id,
      gesture(2).id,
    ]);
    expect(state.taken).toEqual([gesture(1).id]);
    // A taken gesture cannot be chosen again in this run.
    const again = wizardReducer(state, { gesture: gesture(1), type: "toggle" });
    expect(again.selected).toHaveLength(2);
    // Nor preselected.
    const fresh = wizardReducer(
      { ...createWizardState(CHECKOUT_ID), taken: [gesture(1).id] },
      { gestures: [{ ...gesture(1), state: "available" }], type: "preselect" }
    );
    expect(fresh.selected).toEqual([]);
  });

  test("a new attempt gets a new checkout id", () => {
    const state = wizardReducer(withSelection(1), {
      checkoutId: "f0a2b9a4-5c1e-4a51-9d0c-0d6b6f6b2c33",
      type: "newAttempt",
    });
    expect(state.checkoutId).toBe("f0a2b9a4-5c1e-4a51-9d0c-0d6b6f6b2c33");
    expect(state.selected).toHaveLength(1);
  });
});

describe("the details check (S-05–S-08)", () => {
  test("accepts valid details", () => {
    expect(validateDetails(VALID_DETAILS, null)).toEqual({});
  });

  test("requires the display name and caps it at 35", () => {
    expect(
      validateDetails({ ...VALID_DETAILS, displayName: "  " }, null)
    ).toEqual({ displayName: "required" });
    expect(
      validateDetails({ ...VALID_DETAILS, displayName: "x".repeat(36) }, null)
    ).toEqual({ displayName: "tooLong" });
    expect(
      validateDetails({ ...VALID_DETAILS, displayName: "a\u0007b" }, null)
    ).toEqual({ displayName: "invalid" });
  });

  test("requires the logo when the box is checked, with the type and 2 MiB checked", () => {
    const details = { ...VALID_DETAILS, includeLogo: true };
    expect(validateDetails(details, null)).toEqual({ logo: "required" });
    expect(
      validateDetails(details, new Blob(["GIF89a"], { type: "image/gif" }))
    ).toEqual({ logo: "logoType" });
    expect(validateDetails(details, png(2 * 1024 * 1024 + 1))).toEqual({
      logo: "logoTooLarge",
    });
    expect(validateDetails(details, png(2 * 1024 * 1024))).toEqual({});
  });

  test("checks the contact", () => {
    expect(
      validateDetails(
        { ...VALID_DETAILS, contactEmail: "", contactName: "" },
        null
      )
    ).toEqual({ contactEmail: "required", contactName: "required" });
    expect(
      validateDetails({ ...VALID_DETAILS, contactEmail: "jan@" }, null)
    ).toEqual({ contactEmail: "invalid" });
    expect(
      validateDetails({ ...VALID_DETAILS, company: "c".repeat(121) }, null)
    ).toEqual({ company: "tooLong" });
  });

  test("checks the invoice request with the shared BE check", () => {
    const invoice = { ...VALID_DETAILS, wantsInvoice: true };
    expect(validateDetails(invoice, null)).toEqual({
      invoiceEmail: "required",
      invoiceName: "required",
      vatNumber: "required",
    });
    expect(
      validateDetails(
        {
          ...invoice,
          invoiceEmail: "factuur@voorbeeld.be",
          invoiceName: "Jansen BV",
          vatNumber: "0123456789",
        },
        null
      )
    ).toEqual({ vatNumber: "invalid" });
    expect(
      validateDetails(
        {
          ...invoice,
          invoiceEmail: "factuur@voorbeeld.be",
          invoiceName: "Jansen BV",
          vatNumber: "BE 0123.456.749",
        },
        null
      )
    ).toEqual({});
  });
});

describe("the checkout input", () => {
  test("is what the server accepts, priced by priceSponsorship", () => {
    let state = withSelection(2);
    state = wizardReducer(state, {
      patch: {
        ...VALID_DETAILS,
        company: "  ",
        invoiceEmail: "factuur@voorbeeld.be",
        invoiceName: "Jansen BV",
        vatNumber: "BE0123456749",
        wantsInvoice: true,
      },
      type: "details",
    });
    const input = checkoutInput(state, { locale: "fr", logoKey: null });
    expect(checkoutInputSchema.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({
      checkoutId: CHECKOUT_ID,
      contact: { email: "jan@voorbeeld.be", name: "Jan Jansen" },
      displayName: "Bakkerij Jansen",
      expectedTotalCents: 10_000,
      gestureIds: [gesture(0).id, gesture(1).id],
      invoice: { name: "Jansen BV", vatNumber: "BE0123456749" },
      locale: "fr",
    });
    expect(input.contact.company).toBeUndefined();
    expect(input.logoKey).toBeUndefined();
  });

  test("leaves the invoice out when it is not wanted (the fields kept)", () => {
    let state = withSelection(1);
    state = wizardReducer(state, {
      patch: { ...VALID_DETAILS, invoiceName: "Jansen BV" },
      type: "details",
    });
    expect(
      checkoutInput(state, { locale: "nl", logoKey: null }).invoice
    ).toBeUndefined();
    expect(state.details.invoiceName).toBe("Jansen BV");
  });

  test("has no price for an empty selection", () => {
    expect(wizardPrice(createWizardState(CHECKOUT_ID))).toBeNull();
  });
});
