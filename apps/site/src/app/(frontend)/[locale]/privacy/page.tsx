import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConsentDeviceControl } from "@/components/ConsentDeviceControl";
import { isLocale, localeAlternates } from "@/lib/locale";

/**
 * A `generateMetadata` rather than a static `metadata`, because the
 * `alternates` have to name this path in each locale and a static export
 * cannot see the locale — same reasoning as `[locale]/gestures/page.tsx`.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const base = {
    description:
      "Wat SMOG verzamelt met analytics, wie dat verwerkt, en hoe u uw toestemming intrekt.",
    title: "Privacybeleid",
  };

  if (!isLocale(locale)) {
    return base;
  }

  return {
    ...base,
    alternates: {
      canonical: `/${locale}/privacy`,
      languages: localeAlternates("/privacy"),
    },
  };
}

/**
 * The page `ConsentBanner` links to.
 *
 * Scoped to what the banner's own consent decision is about — analytics —
 * rather than a full restatement of every processing activity on the site.
 * `apps/web`'s `routes/privacy.tsx` covers the old stack's accounts,
 * sponsorship and billing; this page does not duplicate it, because this
 * site does not run any of that yet. What it must say, and does say below,
 * is the set Task 4's brief names: what is collected, who processes it,
 * that consent is optional and withdrawable, where to withdraw it, and that
 * the record of the decision itself outlives the account it describes.
 *
 * ## The withdrawal control is on this page, not only behind a sign-in
 *
 * This page used to say withdrawal happens "op uw accountpagina" while also
 * saying — correctly — that no account is needed to use the site. Both
 * cannot be true: `/{locale}/account` redirects a signed-out visitor to
 * `/sign-in`, and `ConsentBanner` returns `null` once it has been answered,
 * so a guest who allowed analytics had no way back at all. The page a
 * withdrawal promise is printed on is the obvious place to keep it, so the
 * device-scoped switch is rendered here for everybody. A signed-in visitor
 * still gets the account page's richer version — the same switch, plus what
 * their account has on record — and `ConsentDeviceControl` is that shared
 * switch rather than a second copy of it.
 *
 * ## "Anoniem" was not true, so it does not say it
 *
 * The first section used to call the analytics "anonieme gebruiksanalytics".
 * `endpoints/analytics.ts`'s `forwardToOpenPanel` sends `x-client-ip` and
 * `user-agent` with every event, and `endpoints/consent.ts` files an address
 * and a user agent alongside the consent record itself. A privacy policy
 * that describes the pleasant version of what the code does is worse than no
 * policy: it is the document a reader is entitled to rely on. What is sent
 * is now listed.
 *
 * The locale check is repeated from the layout for the same reason every
 * other page in this group repeats it: `notFound()` in a layout is caught by
 * the boundary *above* it, so the two render different pages.
 */
export default async function PrivacyPolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <article className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-bold text-foreground text-xxl">Privacybeleid</h1>
        <p className="text-foreground-muted text-sm">
          Dit beleid gaat over de analytics-toestemming die u op deze website
          kunt geven of weigeren.
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-foreground text-lg">
          Wat we verzamelen
        </h2>
        <p className="text-foreground text-md">
          Met uw toestemming verzamelen we beperkte gebruiksanalytics —
          bijvoorbeeld welke pagina&apos;s bezocht worden, welke gebaren bekeken
          worden en waarnaar gezocht wordt — om te begrijpen hoe SMOG gebruikt
          wordt en de app te verbeteren.
        </p>
        <p className="text-foreground text-md">
          Deze gegevens zijn niet anoniem. Bij elke gebeurtenis sturen we ook uw
          IP-adres en de useragent van uw browser mee; daarmee kan bij
          benadering bepaald worden vanwaar u de site bezoekt. De gebeurtenissen
          zelf bevatten geen accountgegevens: ze worden niet aan uw account
          gekoppeld, ook niet wanneer u aangemeld bent. Het record van uw
          toestemming is dat wel — zie hieronder — en daarbij bewaren we uw
          IP-adres en useragent eveneens.
        </p>
        <p className="text-foreground text-md">
          U heeft geen account nodig om de website te gebruiken. We gebruiken
          deze gegevens niet voor advertenties en volgen u niet over andere apps
          of websites heen.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-foreground text-lg">
          Wie de gegevens verwerkt
        </h2>
        <p className="text-foreground text-md">
          De analytics lopen via OpenPanel, zelfgehost op{" "}
          <code className="text-sm">analytics.zias.be</code>. De gebeurtenissen
          worden niet naar de OpenPanel-cloud gestuurd; ze blijven op onze eigen
          installatie.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-foreground text-lg">
          Toestemming is vrijwillig en kan altijd worden ingetrokken
        </h2>
        <p className="text-foreground text-md">
          Analytics staat standaard uit. Als u weigert, of nog niet gekozen
          heeft, wordt er niets gemeten en blijft de website volledig bruikbaar.
          U kunt uw keuze hier op deze pagina op elk moment wijzigen — ook
          zonder account — zonder dat u daardoor toegang tot de website
          verliest.
        </p>
        {/*
         * The control itself, and not a link to one somewhere else. See "The
         * withdrawal control is on this page" in the module doc comment: a
         * guest cannot reach `/{locale}/account` at all, so a promise that
         * pointed only there was a promise this site did not keep.
         */}
        <ConsentDeviceControl locale={locale} />
        <p className="text-foreground-muted text-sm">
          Bent u aangemeld, dan vindt u dezelfde schakelaar op uw{" "}
          <a className="underline" href={`/${locale}/account`}>
            accountpagina
          </a>
          , samen met het antwoord dat voor uw account geregistreerd staat.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-foreground text-lg">
          Bewaring van de toestemming zelf
        </h2>
        <p className="text-foreground text-md">
          We bewaren een record van de keuze die u maakte — toegestaan of
          geweigerd — als bewijs dat er om toestemming gevraagd is en wat u
          antwoordde. Dat record blijft bestaan als bewijsstuk, ook nadat een
          account verwijderd wordt: het wordt dan losgekoppeld van uw
          persoonsgegevens, maar niet gewist.
        </p>
      </section>
    </article>
  );
}
