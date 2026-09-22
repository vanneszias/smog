import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
          Met uw toestemming verzamelen we anonieme gebruiksanalytics —
          bijvoorbeeld welke pagina&apos;s bezocht worden en welke gebaren
          bekeken worden — om te begrijpen hoe SMOG gebruikt wordt en de app te
          verbeteren. U heeft geen account nodig om de website te gebruiken, en
          de analytics zijn niet gekoppeld aan een account tenzij u zelf bent
          aangemeld. We gebruiken deze gegevens niet voor advertenties en volgen
          u niet over andere apps of websites heen.
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
          Heeft u eerder toestemming gegeven, dan kunt u die op elk moment
          intrekken op uw{" "}
          <a className="underline" href={`/${locale}/account`}>
            accountpagina
          </a>
          , zonder dat u daardoor toegang tot de website verliest.
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
