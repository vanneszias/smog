import { Button, Card, Field, Input } from "@smog/ui-web";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SponsorPreview } from "@/components/SponsorPreview";
import { isLocale, resolveLocale } from "@/lib/locale";
import { getPayloadClient } from "@/lib/payloadClient";
import { findSponsorshipByReEditToken } from "@/lib/reEdit";
import { previewPlaybackId } from "@/lib/renderPreview";
import { LOGO_TYPES, MAX_LOGO_BYTES } from "@/lib/sponsorDraft";

export const metadata: Metadata = {
  description: "Pas je sponsoring aan.",
  title: "Je sponsoring aanpassen",
  // A capability URL with somebody's sponsorship behind it. `noindex` is not
  // the protection — the token is — but a crawler that followed a forwarded
  // link should not put it in a search result either.
  robots: { follow: false, index: false },
};

export const dynamic = "force-dynamic";

/** What each refusal is allowed to say. Codes, never free text from a URL. */
const ERRORS: Record<string, string> = {
  logo: "Er is geen bestand gekozen.",
  "logo-size": "Dat logo is te groot.",
  "logo-type": "Een logo moet een PNG, JPEG of WebP zijn.",
  name: "Vul een sponsornaam in van hoogstens 35 tekens.",
};

const MEGABYTE = 1024 * 1024;

/** The gesture's name, when this reader is allowed to see the gesture at all. */
function gestureName(gesture: unknown): null | string {
  if (typeof gesture !== "object" || gesture === null) {
    return null;
  }

  const name = (gesture as { name?: unknown }).name;

  return typeof name === "string" ? name : null;
}

/** The gesture's video, which the sponsor is editing the overlay on. */
function gesturePlaybackId(gesture: unknown): null | string {
  if (typeof gesture !== "object" || gesture === null) {
    return null;
  }

  const playbackId = (gesture as { playbackId?: unknown }).playbackId;

  return typeof playbackId === "string" ? playbackId : null;
}

/**
 * The re-edit page: one sponsorship, addressed by the token in its URL.
 *
 * ## Three screens, and no way to tell two of them apart on purpose
 *
 * A token that resolves gets the form. A token that does not — spent,
 * expired, mistyped, invented, or belonging to a sponsorship that has since
 * moved on — gets one sentence saying the link is no longer valid, and so
 * does an arrival with no token at all. They are deliberately the same
 * answer: distinguishing "expired" from "never existed" tells whoever is
 * holding a forwarded link which of the two they have, and the sponsor's own
 * remedy is identical either way, which is to ask us for a new one.
 *
 * The third screen is the one after a successful post, which arrives back
 * here with `?notice=sent` and no token — because by then the token is
 * destroyed. Without that notice this page would tell a sponsor who has just
 * done exactly the right thing that their link is broken.
 *
 * ## What it shows, and what it deliberately does not
 *
 * The gesture, its video with the sponsor's text drawn over it by
 * `lib/renderPreview.ts`'s Stage 5 seam, and the two things a sponsor may
 * change. It does not show the sponsor's email, contact name, company,
 * invoice details or the review notes: `collections/Sponsorships.ts` strips
 * those at the field layer for this reader, so they are not in the document
 * this page holds, let alone in its HTML. A re-edit link is forwardable, and
 * what it forwards should be a video and a text box.
 */
export default async function SponsorReEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; notice?: string; token?: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const current = resolveLocale(locale);
  const { error, notice, token } = await searchParams;
  const message = error === undefined ? undefined : ERRORS[error];

  if (notice === "sent") {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <h1 className="font-bold text-foreground text-xxl">Bedankt</h1>
        <Card className="flex flex-col gap-3 p-6" data-testid="re-edit-sent">
          <p className="text-foreground text-md">
            We hebben je aanpassing ontvangen. Iemand van ons kijkt ze na en je
            krijgt bericht op het e-mailadres dat je opgaf.
          </p>
          <p className="text-foreground-muted text-sm">
            Deze link werkt niet meer. Moet er nog iets veranderen? Laat het ons
            weten, dan sturen we je een nieuwe.
          </p>
        </Card>
      </div>
    );
  }

  const sponsorship = await findSponsorshipByReEditToken(
    await getPayloadClient(),
    token ?? ""
  );

  if (sponsorship === null) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <h1 className="font-bold text-foreground text-xxl">
          Deze link werkt niet meer
        </h1>
        <Card className="flex flex-col gap-3 p-6" data-testid="re-edit-invalid">
          <p className="text-foreground text-md">
            De link om je sponsoring aan te passen is verlopen of al gebruikt.
          </p>
          <p className="text-foreground-muted text-sm">
            Laat het ons weten als er nog iets moet veranderen, dan sturen we je
            een nieuwe link.
          </p>
        </Card>
      </div>
    );
  }

  const name = gestureName(sponsorship.gesture);
  const playbackId =
    gesturePlaybackId(sponsorship.gesture) ??
    sponsorship.originalVideoPlaybackId;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-foreground text-xxl">
          Je sponsoring aanpassen
        </h1>
        <p className="text-foreground-muted text-sm" data-testid="re-edit-for">
          {name ?? `Gebaar #${sponsorship.id}`}
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
        Je hoeft niets opnieuw te betalen. Pas aan wat moet, stuur het door, en
        we kijken het na.
      </p>

      <SponsorPreview
        overlayText={sponsorship.overlayText}
        playbackId={previewPlaybackId({
          originalVideoPlaybackId: playbackId,
        })}
        title={name ?? `Gebaar #${sponsorship.id}`}
      />

      <form
        action="/sponsor/re-edit"
        className="flex flex-col gap-6"
        encType="multipart/form-data"
        method="post"
      >
        <input name="locale" type="hidden" value={current} />
        <input name="token" type="hidden" value={token ?? ""} />

        <Field
          help="Deze naam komt in beeld bij het gebaar."
          label="Sponsornaam"
        >
          <Input
            data-testid="re-edit-name"
            defaultValue={sponsorship.sponsorName}
            maxLength={35}
            name="sponsorName"
            required
            type="text"
          />
        </Field>

        {/*
         * Only for a sponsorship that paid for a logo. `hasLogo` is what was
         * bought, and the endpoint drops a file posted without it, so
         * rendering the input anyway would offer something that silently does
         * nothing.
         */}
        {sponsorship.hasLogo === true ? (
          <fieldset className="flex flex-col gap-3">
            <legend className="font-medium text-foreground text-sm">
              Logo vervangen (optioneel)
            </legend>
            <input
              accept={LOGO_TYPES.join(",")}
              className="text-foreground text-sm"
              data-testid="re-edit-logo"
              name="logo"
              type="file"
            />
            <p className="text-foreground-muted text-sm">
              PNG, JPEG of WebP, hoogstens {MAX_LOGO_BYTES / MEGABYTE} MB. Kies
              je niets, dan houden we je huidige logo.
            </p>
          </fieldset>
        ) : null}

        <div className="flex justify-end">
          <Button data-testid="re-edit-submit" type="submit">
            Opnieuw indienen
          </Button>
        </div>
      </form>
    </div>
  );
}
