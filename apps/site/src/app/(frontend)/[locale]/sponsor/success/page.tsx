import { Card } from "@smog/ui-web";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, resolveLocale } from "@/lib/locale";

export const metadata: Metadata = {
  description: "Bedankt voor je sponsoring.",
  title: "Bedankt",
  robots: { follow: true, index: false },
};

/**
 * Where Mollie returns the sponsor, whatever they decided there.
 *
 * ## It deliberately does not claim the payment succeeded
 *
 * Mollie sends the sponsor to `redirectUrl` when they finish *and* when they
 * cancel, and the only thing that decides which happened is the webhook —
 * which arrives on a different connection, may not have arrived yet, and is
 * the only source this app trusts about money (`endpoints/mollie.ts`
 * re-reads every payment from Mollie rather than believing a request). So
 * this page says what is true of both outcomes: it is being processed, and
 * you will hear from us.
 *
 * The shipped success page polls `getSponsorshipsByPaymentId` with a
 * `?paymentId=` Mollie substitutes into the redirect URL. This one has no
 * client JavaScript to poll with, so it does not ask for the id — a payment
 * identifier in a URL is one in a browser history, in a `Referer` and in any
 * proxy log, in exchange for nothing.
 *
 * The draft cookie is deliberately *not* cleared here. Clearing it would need
 * this to be a write, and the cookie expires in an hour on its own; a sponsor
 * who comes back to step 3 inside that hour finds their own details, which is
 * the better of the two failures.
 */
export default async function SponsorSuccessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const current = resolveLocale(locale);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <h1 className="font-bold text-foreground text-xxl">Bedankt</h1>
      <Card className="flex flex-col gap-3 p-6" data-testid="sponsor-success">
        <p className="text-foreground text-md">
          We verwerken je betaling. Zodra ze binnen is, kijkt iemand van ons je
          sponsoring na en krijg je bericht op het e-mailadres dat je opgaf.
        </p>
        <p className="text-foreground-muted text-sm">
          Heb je de betaling afgebroken? Dan is er niets aangerekend en kan je
          gewoon opnieuw beginnen.
        </p>
      </Card>
      <a
        className="text-foreground text-sm underline underline-offset-2"
        href={`/${current}/sponsor`}
      >
        Nog een gebaar sponsoren
      </a>
    </div>
  );
}
