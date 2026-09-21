import { Button, Card } from "@smog/ui-web";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SponsorPreview } from "@/components/SponsorPreview";
import { sponsorPath } from "@/lib/authFlow";
import { isLocale, resolveLocale } from "@/lib/locale";
import { getPayloadClient } from "@/lib/payloadClient";
import { formatEuro, sponsorshipAmountCents } from "@/lib/pricing";
import { previewPlaybackId } from "@/lib/renderPreview";
import { decodeSponsorDraft, SPONSOR_DRAFT_COOKIE } from "@/lib/sponsorDraft";
import { resolveSponsorSelection } from "@/lib/sponsorSelection";

export const metadata: Metadata = {
  description: "Bekijk je sponsoring na en betaal.",
  title: "Nakijken en betalen",
  robots: { follow: true, index: false },
};

export const dynamic = "force-dynamic";

/** What each refusal is allowed to say. Codes, never free text from a URL. */
const ERRORS: Record<string, string> = {
  payment:
    "De betaling kon niet gestart worden. Er is niets aangerekend. Probeer het straks opnieuw.",
};

/**
 * Step 3 of the sponsor wizard: review, then pay.
 *
 * **The preview is uncomposited, on purpose.** `lib/renderPreview.ts` is the
 * seam: in this stage it plays the gesture's own video and the overlay text
 * is drawn as HTML on top of it, because composition is Remotion and Mux and
 * the spec puts those in Stage 6. The product owner confirmed the ordering on
 * 2026-09-21. Stage 6 replaces that function's body, not its signature, and
 * not this page.
 *
 * The sponsor's details come out of the draft cookie step 2 set, and go
 * straight back out as hidden fields — `checkout` reads the *form*, not the
 * cookie, so the endpoint stays an ordinary form post like every other write
 * in this app and re-validates every field with the same functions step 2
 * used.
 */
export default async function SponsorPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const current = resolveLocale(locale);
  const { error } = await searchParams;
  const message = error === undefined ? undefined : ERRORS[error];

  const draft = decodeSponsorDraft(
    (await cookies()).get(SPONSOR_DRAFT_COOKIE)?.value ?? null
  );

  /*
   * No draft is not an error worth a sentence: it is a sponsor who arrived
   * here directly, or whose hour ran out, or who came back to a bookmark. The
   * only useful answer is the beginning of the wizard. `redirect` throws, so
   * nothing below runs.
   */
  if (draft === null) {
    redirect(sponsorPath(current));
  }

  const selection = await resolveSponsorSelection(
    await getPayloadClient(),
    draft.gestureIds
  );

  if ("error" in selection) {
    redirect(sponsorPath(current, { error: selection.error }));
  }

  const count = selection.gestures.length;
  const totalCents = sponsorshipAmountCents(count, draft.wantsLogo);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-foreground text-xxl">
          Nakijken en betalen
        </h1>
        <p className="text-foreground-muted text-sm" data-testid="sponsor-step">
          Stap 3 van 3
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

      <p className="rounded-md border border-border bg-surface px-4 py-3 text-foreground-muted text-sm">
        Je ziet hieronder het gebaar zoals het nu is, met jouw tekst erover. De
        definitieve video met jouw naam erin gemonteerd volgt na goedkeuring.
      </p>

      <ul className="flex flex-col gap-6" data-testid="sponsor-previews">
        {selection.gestures.map((gesture) => (
          <li key={gesture.id}>
            <SponsorPreview
              overlayText={draft.sponsorName}
              playbackId={previewPlaybackId({
                originalVideoPlaybackId: gesture.playbackId,
              })}
              title={gesture.name ?? `#${gesture.id}`}
            />
          </li>
        ))}
      </ul>

      <Card className="flex flex-col gap-2 p-4">
        <h2 className="font-semibold text-foreground text-md">Je gegevens</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-foreground-muted">Sponsornaam</dt>
          <dd className="text-foreground" data-testid="review-sponsor-name">
            {draft.sponsorName}
          </dd>
          <dt className="text-foreground-muted">Contactpersoon</dt>
          <dd className="text-foreground">{draft.contactFullName}</dd>
          <dt className="text-foreground-muted">E-mail</dt>
          <dd className="text-foreground">{draft.sponsorEmail}</dd>
          {draft.contactCompany === "" ? null : (
            <>
              <dt className="text-foreground-muted">Bedrijf</dt>
              <dd className="text-foreground">{draft.contactCompany}</dd>
            </>
          )}
          {draft.invoiceRequested ? (
            <>
              <dt className="text-foreground-muted">Factuur op naam van</dt>
              <dd className="text-foreground">{draft.invoiceName}</dd>
              <dt className="text-foreground-muted">Ondernemingsnummer</dt>
              <dd className="text-foreground">{draft.invoiceVatNumber}</dd>
              <dt className="text-foreground-muted">Factuur naar</dt>
              <dd className="text-foreground">{draft.invoiceEmail}</dd>
            </>
          ) : null}
          <dt className="text-foreground-muted">Logo</dt>
          <dd className="text-foreground">{draft.wantsLogo ? "ja" : "nee"}</dd>
        </dl>
        <a
          className="text-foreground-muted text-sm underline underline-offset-2"
          href={`/${current}/sponsor/details?gestures=${selection.gestures
            .map((gesture) => gesture.id)
            .join(",")}`}
        >
          Je gegevens aanpassen
        </a>
      </Card>

      <form
        action="/sponsor/checkout"
        className="flex flex-col gap-4"
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
        <input name="sponsorName" type="hidden" value={draft.sponsorName} />
        <input
          name="contactFullName"
          type="hidden"
          value={draft.contactFullName}
        />
        <input name="sponsorEmail" type="hidden" value={draft.sponsorEmail} />
        <input
          name="contactCompany"
          type="hidden"
          value={draft.contactCompany}
        />
        {/*
         * A checkbox is present when ticked and absent when not, so the
         * hidden fields that stand in for two checkboxes are *rendered* when
         * ticked and omitted when not. A hidden `value="false"` would be
         * present either way and would opt every sponsor into both.
         */}
        {draft.wantsLogo ? (
          <input name="wantsLogo" type="hidden" value="on" />
        ) : null}
        {draft.logoMediaId === null ? null : (
          <input name="logoMediaId" type="hidden" value={draft.logoMediaId} />
        )}
        {draft.invoiceRequested ? (
          <>
            <input name="invoiceRequested" type="hidden" value="on" />
            <input name="invoiceName" type="hidden" value={draft.invoiceName} />
            <input
              name="invoiceVatNumber"
              type="hidden"
              value={draft.invoiceVatNumber}
            />
            <input
              name="invoiceEmail"
              type="hidden"
              value={draft.invoiceEmail}
            />
          </>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border bg-surface px-4 py-3">
          <p
            className="font-medium text-foreground text-md"
            data-testid="sponsor-total"
          >
            {count} {count === 1 ? "gebaar" : "gebaren"} —{" "}
            {formatEuro(totalCents)}
          </p>
          <Button data-testid="sponsor-pay" type="submit">
            Betalen
          </Button>
        </div>
      </form>
    </div>
  );
}
