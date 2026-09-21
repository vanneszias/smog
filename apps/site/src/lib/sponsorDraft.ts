/**
 * The sponsor's own details: reading them off a form, and carrying them from
 * step 2 to step 3.
 *
 * Pure — no Payload, no `next/headers`, no database — so it is unit-testable
 * under jsdom and so the two endpoints and the preview page can all reach for
 * it without dragging anything with them.
 *
 * ## Every bound here is transcribed, not designed
 *
 * The migration's non-goal is that the sponsor purchase flow behaves as it
 * does today, so the numbers come from the shipped product rather than from
 * taste: `apps/web/src/routes/sponsors/components/-StepDetails.tsx` for the
 * sponsor name (`maxLength={35}`) and the logo (2 MB,
 * `image/png,image/jpeg,image/webp`), `.../utils/-validation.ts` for the
 * Belgian VAT rule, and `packages/api/src/routers/sponsorships.ts` for the
 * rest of the lengths.
 *
 * **There is no separate "overlay text" field, and the plan implies there is
 * one.** The shipped wizard collects `sponsorName` once and sends
 * `overlayText: form.sponsorName` — one input, two columns. A second input
 * would be a new field in the product, so this keeps the shipped shape and
 * `endpoints/sponsorships.ts` writes the same value to both. The bound is
 * therefore the sponsor name's 35, not the API's more generous 100.
 */

/**
 * The sponsor name, which is also the overlay text. 35 is the shipped cap.
 *
 * Exported because the re-edit form in `endpoints/sponsorships.ts` collects
 * this one field on its own, without the contact and invoice half
 * `readSponsorDetails` requires, and the two bounds must be the same number:
 * a name the wizard accepted must not be one the re-edit refuses.
 */
export const MAX_SPONSOR_NAME = 35;
const MAX_CONTACT_NAME = 120;
const MAX_COMPANY = 120;
const MAX_EMAIL = 254;
const MAX_INVOICE_NAME = 160;
const MAX_VAT = 32;

/**
 * How big a logo may be, in bytes.
 *
 * 2 MB, from `-StepDetails.tsx`'s `file.size > 2 * 1024 * 1024`. The check is
 * here as well as there because that one runs in a browser this app does not
 * control, and R2 will happily store whatever arrives.
 */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * The image types a logo may be.
 *
 * The same three the shipped file input accepts. An `accept` attribute is a
 * filter in a file picker and nothing else — it is not enforced on submit, on
 * a drag-and-drop, or by anybody posting the form directly.
 */
export const LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * What every logo this application stores is called.
 *
 * `endpoints/sponsorships.ts` names the file itself rather than taking the
 * browser's name, because a client-supplied name is a client-supplied R2 key
 * and two sponsors uploading `logo.png` should not be one sponsor overwriting
 * the other. That makes the prefix an invariant of this application rather
 * than a convention, and `jobs/cleanupOrphanedMedia.ts` leans on it: `media`
 * is a general collection an administrator may also upload to, and a sweep
 * that deleted every unreferenced row would delete their library.
 *
 * Here rather than in either of them, so the name a logo is written under and
 * the name a sweep looks for cannot drift into disagreeing — which would be a
 * sweep that silently stopped finding anything, or one that started deleting
 * things it should not.
 */
export const SPONSOR_LOGO_PREFIX = "sponsor-logo-";

/*
 * Neither this nor `SponsorDraft` below is exported, and `isVatNumber` is not
 * either: knip fails `bun release:check` on an exported symbol nothing
 * imports, and every caller here names the *function's* type rather than the
 * type itself — the endpoints narrow on `"error" in …` and the preview page
 * infers the draft from `decodeSponsorDraft`. They are still this module's
 * contract; they are just stated in the signatures instead of re-exported.
 */

/** Why a set of details was refused. */
type DetailsRefusal =
  /** The contact's name is blank or too long. */
  | "contact"
  /** The sponsor's email address is not an address. */
  | "email"
  /** An invoice was asked for without the details an invoice needs. */
  | "invoice"
  /** The sponsor name — which is also the overlay text — is blank or too long. */
  | "name"
  /** The VAT number is not a Belgian ondernemingsnummer. */
  | "vat";

/** The details a sponsorship row is built from. */
export interface SponsorDetails {
  contactCompany: string;
  contactFullName: string;
  invoiceEmail: string;
  invoiceName: string;
  invoiceRequested: boolean;
  invoiceVatNumber: string;
  sponsorEmail: string;
  sponsorName: string;
  wantsLogo: boolean;
}

/** A whole order in progress, as the cookie between step 2 and step 3 holds it. */
interface SponsorDraft extends SponsorDetails {
  /** The selected gestures, as strings because that is what a form sends. */
  gestureIds: string[];
  /** The uploaded logo's `media` id, or `null` when there is no logo. */
  logoMediaId: null | string;
}

/**
 * The cookie step 2 writes and step 3 reads.
 *
 * **Why a cookie and not the query string.** Step 2 is a POST and step 3 is a
 * GET, so something has to survive a redirect between them, and the sponsor's
 * name, address, company and VAT number have no business in a URL: a URL ends
 * up in browser history, in the `Referer` of every asset the next page loads,
 * and in any proxy log on the way. The *selection* travels in the URL because
 * gesture ids are public; the person does not.
 *
 * **Why it is not signed.** Nothing is authorised by it. `checkout` re-reads
 * every field from the submitted form and re-validates all of them, resolves
 * the gestures again with `overrideAccess: false`, and computes the price
 * from the resolved selection — so the worst a forged cookie can do is
 * prefill a form with the forger's own details. The one id in it names a
 * `media` row, and `media` is public-read, so pointing it at somebody else's
 * upload reveals nothing that was not already served.
 *
 * `httpOnly` all the same: there is no reason for script to read it, and the
 * default should be that a draft of somebody's contact details is not
 * scriptable.
 */
export const SPONSOR_DRAFT_COOKIE = "smog-sponsor-draft";

/** An hour: long enough to read a preview, short enough not to linger. */
export const SPONSOR_DRAFT_TTL_SECONDS = 3600;

/** One field, as a trimmed string, whatever the form actually carried. */
function text(form: FormData, name: string): string {
  const value = form.get(name);

  return typeof value === "string" ? value.trim() : "";
}

/**
 * A checkbox is present when ticked and absent when not.
 *
 * Compared against absence rather than against `"on"`: a browser sends `on`
 * for a checkbox with no `value`, but the attribute is settable and a form
 * rendered differently later would silently stop opting anybody in.
 */
function ticked(form: FormData, name: string): boolean {
  return form.get(name) !== null;
}

/**
 * Whether a string is a Belgian ondernemingsnummer.
 *
 * Ten digits, where the last two equal `97 - (first eight mod 97)`; spaces and
 * dots are stripped first because that is how the number is printed on every
 * invoice. Transcribed from `apps/web/src/routes/sponsors/utils/-validation.ts`
 * rather than re-derived — an invoice is a legal document and a VAT number
 * that does not check is one the accountant sends back.
 */
function isVatNumber(value: string): boolean {
  const digits = value.replace(/[\s.]/g, "");

  if (!/^\d{10}$/.test(digits)) {
    return false;
  }

  const body = Number.parseInt(digits.slice(0, 8), 10);
  const check = Number.parseInt(digits.slice(8), 10);

  return 97 - (body % 97) === check;
}

/** Whether the invoice half of the form is complete and well-formed. */
function refuseInvoice(
  details: SponsorDetails,
  isEmail: (value: string) => boolean
): DetailsRefusal | null {
  if (
    details.invoiceName === "" ||
    details.invoiceName.length > MAX_INVOICE_NAME ||
    details.invoiceVatNumber === "" ||
    details.invoiceVatNumber.length > MAX_VAT ||
    details.invoiceEmail === "" ||
    details.invoiceEmail.length > MAX_EMAIL ||
    !isEmail(details.invoiceEmail)
  ) {
    return "invoice";
  }

  if (!isVatNumber(details.invoiceVatNumber)) {
    return "vat";
  }

  return null;
}

/**
 * The sponsor's details out of a submitted form, or the code that refuses
 * them.
 *
 * `isEmail` is injected rather than imported so this module stays free of
 * `lib/authFlow.ts`'s regex *and* so the caller cannot accidentally use a
 * looser one: both endpoints pass `isEmailShaped`, which is Payload's own
 * expression copied from `payload/dist/fields/validations.js`. Screening with
 * the same rule Payload validates with is what keeps a bad address a sentence
 * rather than a `ValidationError` rendered as JSON in a browser window.
 *
 * **The invoice fields are read only when an invoice was asked for**, and
 * blanked otherwise. A sponsor who fills the invoice box, changes their mind
 * and unticks it must not have their VAT number stored anyway — it is
 * identifying data with no purpose left, and the shipped mutation drops it
 * the same way.
 */
export function readSponsorDetails(
  form: FormData,
  isEmail: (value: string) => boolean
): { error: DetailsRefusal } | SponsorDetails {
  const sponsorName = text(form, "sponsorName");

  if (sponsorName === "" || sponsorName.length > MAX_SPONSOR_NAME) {
    return { error: "name" };
  }

  const contactFullName = text(form, "contactFullName");

  if (contactFullName === "" || contactFullName.length > MAX_CONTACT_NAME) {
    return { error: "contact" };
  }

  const sponsorEmail = text(form, "sponsorEmail").toLowerCase();

  if (
    sponsorEmail === "" ||
    sponsorEmail.length > MAX_EMAIL ||
    !isEmail(sponsorEmail)
  ) {
    return { error: "email" };
  }

  const contactCompany = text(form, "contactCompany");

  if (contactCompany.length > MAX_COMPANY) {
    return { error: "contact" };
  }

  const invoiceRequested = ticked(form, "invoiceRequested");

  const details: SponsorDetails = {
    contactCompany,
    contactFullName,
    invoiceEmail: invoiceRequested
      ? text(form, "invoiceEmail").toLowerCase()
      : "",
    invoiceName: invoiceRequested ? text(form, "invoiceName") : "",
    invoiceRequested,
    invoiceVatNumber: invoiceRequested ? text(form, "invoiceVatNumber") : "",
    sponsorEmail,
    sponsorName,
    wantsLogo: ticked(form, "wantsLogo"),
  };

  if (invoiceRequested) {
    const refusal = refuseInvoice(details, isEmail);

    if (refusal !== null) {
      return { error: refusal };
    }
  }

  return details;
}

/**
 * The draft as a cookie value.
 *
 * `encodeURIComponent` rather than base64: a sponsor name can hold any
 * character at all, `btoa` throws on anything outside Latin-1, and a cookie
 * value may not contain a comma, a semicolon or whitespace. Percent-encoding
 * is the one transform that handles both halves and round-trips exactly.
 *
 * The bounds above are what keep this inside a browser's 4096-byte cookie:
 * ten gesture ids, 35 + 120 + 120 + 254 + 160 + 32 + 254 characters of text
 * and two flags come to well under a kilobyte before encoding.
 */
export function encodeSponsorDraft(draft: SponsorDraft): string {
  return encodeURIComponent(JSON.stringify(draft));
}

function stringField(source: Record<string, unknown>, name: string): string {
  const value = source[name];

  return typeof value === "string" ? value : "";
}

/**
 * The draft a cookie carries, or `null` if there is not one this app wrote.
 *
 * Every clause is a way a cookie can fail to be a draft, and none of them is
 * defensive: a cookie survives a deploy, so one written by an older version
 * of this page reaches here through the same door as a fresh one — and a
 * cookie is user-controlled, so a hand-edited value does too. Nothing is
 * coerced; a shape that is not a draft is not one.
 */
export function decodeSponsorDraft(raw: null | string): null | SponsorDraft {
  if (raw === null || raw === "") {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const source = parsed as Record<string, unknown>;
  const gestureIds = source.gestureIds;

  if (
    !Array.isArray(gestureIds) ||
    gestureIds.some((id) => typeof id !== "string")
  ) {
    return null;
  }

  const logoMediaId = source.logoMediaId;

  return {
    contactCompany: stringField(source, "contactCompany"),
    contactFullName: stringField(source, "contactFullName"),
    gestureIds: gestureIds as string[],
    invoiceEmail: stringField(source, "invoiceEmail"),
    invoiceName: stringField(source, "invoiceName"),
    invoiceRequested: source.invoiceRequested === true,
    invoiceVatNumber: stringField(source, "invoiceVatNumber"),
    logoMediaId: typeof logoMediaId === "string" ? logoMediaId : null,
    sponsorEmail: stringField(source, "sponsorEmail"),
    sponsorName: stringField(source, "sponsorName"),
    wantsLogo: source.wantsLogo === true,
  };
}
