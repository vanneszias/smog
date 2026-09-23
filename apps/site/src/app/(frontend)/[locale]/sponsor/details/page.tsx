import { Button, Card, Field, Input } from "@smog/ui-web";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { sponsorPath } from "@/lib/authFlow";
import { isLocale, resolveLocale } from "@/lib/locale";
import { getPayloadClient } from "@/lib/payloadClient";
import { formatEuro, sponsorshipAmountCents } from "@/lib/pricing";
import { LOGO_TYPES, MAX_LOGO_BYTES } from "@/lib/sponsorDraft";
import { resolveSponsorSelection } from "@/lib/sponsorSelection";

export const metadata: Metadata = {
  description: "Vul je sponsorgegevens in.",
  title: "Je gegevens",
  // A step of a purchase flow with a selection in its URL. There is nothing
  // here for an index, and a crawler would file one sponsor's order under it.
  robots: { follow: true, index: false },
};

export const dynamic = "force-dynamic";

/** What each refusal is allowed to say. Codes, never free text from a URL. */
const ERRORS: Record<string, string> = {
  contact:
    "Vul de naam van de contactpersoon in (hoogstens 120 tekens), en houd de bedrijfsnaam even kort.",
  email: "Dat is geen geldig e-mailadres.",
  invoice: "Vul alle factuurgegevens in.",
  logo: "Je koos voor een logo, maar er is geen bestand gekozen.",
  "logo-size": "Dat logo is te groot.",
  "logo-type": "Een logo moet een PNG, JPEG of WebP zijn.",
  name: "Vul een sponsornaam in van hoogstens 35 tekens.",
  vat: "Dat is geen geldig ondernemingsnummer.",
};

const MEGABYTE = 1024 * 1024;

/**
 * Step 2 of the sponsor wizard: who is sponsoring, and with what.
 *
 * **The selection is read out of the URL and resolved again here**, rather
 * than trusted. A link to this page is a link to an order in progress —
 * gesture ids are public, so that costs nothing and buys a step that survives
 * a reload and a back button with no state anywhere. What it does not buy is
 * a guarantee: one of those gestures can have been sold in between, so the
 * page resolves them through the same function the endpoints use and sends
 * the sponsor back to step 1 when the selection no longer stands.
 *
 * `multipart/form-data`, because of the logo. Everything else on this site
 * posts `application/x-www-form-urlencoded`, which cannot carry a file at all.
 */
export default async function SponsorDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; gestures?: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const current = resolveLocale(locale);
  const { error, gestures } = await searchParams;
  const message = error === undefined ? undefined : ERRORS[error];

  const selected = (gestures ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");

  const selection = await resolveSponsorSelection(
    await getPayloadClient(),
    selected
  );

  /*
   * `redirect` throws, so nothing below runs for a selection that no longer
   * stands. The sponsor lands back on step 1 with the reason on the screen —
   * which is where the thing they have to change is.
   */
  if ("error" in selection) {
    redirect(sponsorPath(current, { error: selection.error }));
  }

  const count = selection.gestures.length;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-foreground text-xxl">Je gegevens</h1>
        <p className="text-foreground-muted text-sm" data-testid="sponsor-step">
          Stap 2 van 3
        </p>
      </div>

      {message === undefined ? null : (
        <p
          className="rounded-md border border-danger bg-surface px-4 py-3 font-medium text-danger text-sm"
          data-testid="sponsor-error"
          role="alert"
        >
          {message}
        </p>
      )}

      <Card className="flex flex-col gap-2 p-4">
        <h2 className="font-semibold text-foreground text-md">
          Je kiest {count} {count === 1 ? "gebaar" : "gebaren"}
        </h2>
        <ul className="flex flex-col gap-1" data-testid="sponsor-chosen">
          {selection.gestures.map((gesture) => (
            <li className="text-foreground text-sm" key={gesture.id}>
              {gesture.name ?? `#${gesture.id}`}
            </li>
          ))}
        </ul>
        <a
          className="text-foreground-muted text-sm underline underline-offset-2"
          href={`/${current}/sponsor?${selection.gestures
            .map((gesture) => `gestureId=${gesture.id}`)
            .join("&")}`}
        >
          Je keuze aanpassen
        </a>
      </Card>

      <form
        action="/sponsor/details"
        className="flex flex-col gap-6"
        encType="multipart/form-data"
        method="post"
      >
        <input name="locale" type="hidden" value={current} />
        {selection.gestures.map((gesture) => (
          <input
            key={gesture.id}
            name="gestureId"
            type="hidden"
            value={gesture.id}
          />
        ))}

        <Field
          help="Deze naam komt in beeld bij het gebaar."
          label="Sponsornaam"
        >
          <Input
            data-testid="sponsor-name"
            maxLength={35}
            name="sponsorName"
            required
            type="text"
          />
        </Field>

        <Field label="Naam contactpersoon">
          <Input
            data-testid="sponsor-contact"
            maxLength={120}
            name="contactFullName"
            required
            type="text"
          />
        </Field>

        <Field label="E-mailadres">
          <Input
            data-testid="sponsor-email"
            maxLength={254}
            name="sponsorEmail"
            required
            type="email"
          />
        </Field>

        <Field label="Bedrijfsnaam (optioneel)">
          <Input
            data-testid="sponsor-company"
            maxLength={120}
            name="contactCompany"
            type="text"
          />
        </Field>

        <fieldset className="flex flex-col gap-3">
          <legend className="font-medium text-foreground text-sm">Logo</legend>
          <label className="flex items-center gap-2 text-foreground text-sm">
            <input
              className="size-4 accent-primary"
              data-testid="sponsor-wants-logo"
              name="wantsLogo"
              type="checkbox"
            />
            Mijn logo erbij (+
            {formatEuro(
              sponsorshipAmountCents(1, true) - sponsorshipAmountCents(1, false)
            )}{" "}
            per gebaar)
          </label>
          <input
            accept={LOGO_TYPES.join(",")}
            className="text-foreground text-sm"
            data-testid="sponsor-logo"
            name="logo"
            type="file"
          />
          <p className="text-foreground-muted text-sm">
            PNG, JPEG of WebP, hoogstens {MAX_LOGO_BYTES / MEGABYTE} MB.
          </p>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="font-medium text-foreground text-sm">
            Factuur
          </legend>
          <label className="flex items-center gap-2 text-foreground text-sm">
            <input
              className="size-4 accent-primary"
              data-testid="sponsor-wants-invoice"
              name="invoiceRequested"
              type="checkbox"
            />
            Ik wil een factuur
          </label>
          {/*
           * Always rendered, never hidden behind the checkbox. There is no
           * client JavaScript here to reveal them, and a field a sponsor
           * cannot see is one they cannot fill — the endpoint ignores all
           * three unless the box above is ticked.
           */}
          <Field label="Facturatienaam">
            <Input
              data-testid="invoice-name"
              maxLength={160}
              name="invoiceName"
              type="text"
            />
          </Field>
          <Field label="Ondernemingsnummer">
            <Input
              data-testid="invoice-vat"
              maxLength={32}
              name="invoiceVatNumber"
              type="text"
            />
          </Field>
          <Field label="E-mailadres voor de factuur">
            <Input
              data-testid="invoice-email"
              maxLength={254}
              name="invoiceEmail"
              type="email"
            />
          </Field>
        </fieldset>

        <Button data-testid="sponsor-to-preview" type="submit">
          Verder naar het overzicht
        </Button>
      </form>
    </div>
  );
}
