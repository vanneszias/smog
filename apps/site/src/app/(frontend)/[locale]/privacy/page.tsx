import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConsentDeviceControl } from "@/components/ConsentDeviceControl";
import { isLocale, type Locale, localeAlternates } from "@/lib/locale";

/**
 * A `generateMetadata` rather than a static `metadata`, because the
 * `alternates` have to name this path in each locale and a static export
 * cannot see the locale — same reasoning as `[locale]/gestures/page.tsx`.
 */
/**
 * The policy text, per locale.
 *
 * **Only the Dutch is reviewed.** English and French are machine-assisted
 * drafts written on 2026-09-22 and have been checked by neither a translator
 * nor a lawyer. Each carries a `draft` notice, rendered at the top of the page
 * in its own language, that says so and names the Dutch text as the one that
 * applies. Remove a locale's `draft` only once its text has been signed off —
 * the notice is the only thing standing between a reader and a translation
 * nobody has vouched for.
 *
 * A translation must keep every fact the Dutch states, not a pleasanter
 * version of them: the page test checks each locale for the ones that were
 * once wrong ("niet anoniem", the IP address and user agent).
 */
interface PolicyCopy {
  metaTitle: string;
  metaDescription: string;
  draft: { notice: string; authoritative: string } | null;
  intro: string;
  collectHeading: string;
  collectUsage: string;
  collectNotAnonymous: string;
  collectNoAccount: string;
  processorHeading: string;
  processorBefore: string;
  processorAfter: string;
  consentHeading: string;
  consentBody: string;
  accountBefore: string;
  accountLink: string;
  accountAfter: string;
  retentionHeading: string;
  retentionBody: string;
}

const COPY: Record<Locale, PolicyCopy> = {
  nl: {
    metaTitle: "Privacybeleid",
    metaDescription:
      "Wat SMOG & Co verzamelt met analytics, wie dat verwerkt, en hoe u uw toestemming intrekt.",
    draft: null,
    intro:
      "Dit beleid gaat over de analytics-toestemming die u op deze website kunt geven of weigeren.",
    collectHeading: "Wat we verzamelen",
    collectUsage:
      "Met uw toestemming verzamelen we beperkte gebruiksanalytics — bijvoorbeeld welke pagina's bezocht worden, welke gebaren bekeken worden en waarnaar gezocht wordt — om te begrijpen hoe SMOG & Co gebruikt wordt en de app te verbeteren.",
    collectNotAnonymous:
      "Deze gegevens zijn niet anoniem. Bij elke gebeurtenis sturen we ook uw IP-adres en de useragent van uw browser mee; daarmee kan bij benadering bepaald worden vanwaar u de site bezoekt. De gebeurtenissen zelf bevatten geen accountgegevens: ze worden niet aan uw account gekoppeld, ook niet wanneer u aangemeld bent. Het record van uw toestemming is dat wel — zie hieronder — en daarbij bewaren we uw IP-adres en useragent eveneens.",
    collectNoAccount:
      "U heeft geen account nodig om de website te gebruiken. We gebruiken deze gegevens niet voor advertenties en volgen u niet over andere apps of websites heen.",
    processorHeading: "Wie de gegevens verwerkt",
    processorBefore: "De analytics lopen via OpenPanel, zelfgehost op ",
    processorAfter:
      ". De gebeurtenissen worden niet naar de OpenPanel-cloud gestuurd; ze blijven op onze eigen installatie.",
    consentHeading:
      "Toestemming is vrijwillig en kan altijd worden ingetrokken",
    consentBody:
      "Analytics staat standaard uit. Als u weigert, of nog niet gekozen heeft, wordt er niets gemeten en blijft de website volledig bruikbaar. U kunt uw keuze hier op deze pagina op elk moment wijzigen — ook zonder account — zonder dat u daardoor toegang tot de website verliest.",
    accountBefore: "Bent u aangemeld, dan vindt u dezelfde schakelaar op uw ",
    accountLink: "accountpagina",
    accountAfter:
      ", samen met het antwoord dat voor uw account geregistreerd staat.",
    retentionHeading: "Bewaring van de toestemming zelf",
    retentionBody:
      "We bewaren een record van de keuze die u maakte — toegestaan of geweigerd — als bewijs dat er om toestemming gevraagd is en wat u antwoordde. Dat record blijft bestaan als bewijsstuk, ook nadat een account verwijderd wordt: het wordt dan losgekoppeld van uw persoonsgegevens, maar niet gewist.",
  },
  en: {
    metaTitle: "Privacy policy",
    metaDescription:
      "What SMOG & Co collects with analytics, who processes it, and how to withdraw your consent.",
    draft: {
      notice:
        "Unreviewed draft translation. This English text has not yet been checked by a translator or reviewed by a lawyer. Only the Dutch version applies.",
      authoritative: "Read the Dutch version",
    },
    intro:
      "This policy covers the analytics consent you can give or refuse on this website.",
    collectHeading: "What we collect",
    collectUsage:
      "With your consent, we collect limited usage analytics — for example, which pages are visited, which gestures are viewed and what is searched for — to understand how SMOG & Co is used and to improve the app.",
    collectNotAnonymous:
      "This data is not anonymous. With every event we also send your IP address and your browser's user agent, which can be used to work out roughly where you are visiting the site from. The events themselves contain no account details: they are not linked to your account, even when you are signed in. The record of your consent is — see below — and we store your IP address and user agent with it as well.",
    collectNoAccount:
      "You do not need an account to use the website. We do not use this data for advertising, and we do not track you across other apps or websites.",
    processorHeading: "Who processes the data",
    processorBefore: "The analytics run through OpenPanel, self-hosted at ",
    processorAfter:
      ". The events are not sent to the OpenPanel cloud; they stay on our own installation.",
    consentHeading: "Consent is voluntary and can be withdrawn at any time",
    consentBody:
      "Analytics is off by default. If you refuse, or have not chosen yet, nothing is measured and the website remains fully usable. You can change your choice here on this page at any time — without an account, too — without losing access to the website.",
    accountBefore:
      "If you are signed in, you will find the same switch on your ",
    accountLink: "account page",
    accountAfter: ", together with the answer recorded for your account.",
    retentionHeading: "Keeping the consent record itself",
    retentionBody:
      "We keep a record of the choice you made — allowed or refused — as proof that consent was asked for and of what you answered. That record is kept as evidence even after an account is deleted: it is then detached from your personal data, but not erased.",
  },
  fr: {
    metaTitle: "Politique de confidentialité",
    metaDescription:
      "Ce que SMOG & Co collecte avec ses données d'analyse, qui les traite et comment retirer votre consentement.",
    draft: {
      notice:
        "Traduction provisoire non relue. Ce texte français n'a encore été vérifié ni par un traducteur ni par un juriste. Seule la version néerlandaise fait foi.",
      authoritative: "Lire la version néerlandaise",
    },
    intro:
      "Cette politique porte sur le consentement aux données d'analyse que vous pouvez donner ou refuser sur ce site.",
    collectHeading: "Ce que nous collectons",
    collectUsage:
      "Avec votre consentement, nous collectons des données d'analyse limitées — par exemple les pages visitées, les gestes consultés et les recherches effectuées — afin de comprendre comment SMOG & Co est utilisé et d'améliorer l'application.",
    collectNotAnonymous:
      "Ces données ne sont pas anonymes. Avec chaque événement, nous envoyons aussi votre adresse IP et l'agent utilisateur (user agent) de votre navigateur, ce qui permet de déterminer approximativement d'où vous consultez le site. Les événements eux-mêmes ne contiennent aucune donnée de compte : ils ne sont pas liés à votre compte, même lorsque vous êtes connecté. L'enregistrement de votre consentement l'est — voir ci-dessous — et nous y conservons également votre adresse IP et votre agent utilisateur.",
    collectNoAccount:
      "Vous n'avez pas besoin de compte pour utiliser le site. Nous n'utilisons pas ces données à des fins publicitaires et ne vous suivons pas dans d'autres applications ou sur d'autres sites web.",
    processorHeading: "Qui traite les données",
    processorBefore:
      "Les données d'analyse passent par OpenPanel, auto-hébergé sur ",
    processorAfter:
      ". Les événements ne sont pas envoyés vers le cloud d'OpenPanel ; ils restent sur notre propre installation.",
    consentHeading:
      "Le consentement est facultatif et peut être retiré à tout moment",
    consentBody:
      "Les données d'analyse sont désactivées par défaut. Si vous refusez, ou si vous n'avez pas encore fait de choix, rien n'est mesuré et le site reste entièrement utilisable. Vous pouvez modifier votre choix ici, sur cette page, à tout moment — y compris sans compte — sans perdre l'accès au site.",
    accountBefore:
      "Si vous êtes connecté, vous trouverez le même interrupteur sur votre ",
    accountLink: "page de compte",
    accountAfter: ", avec la réponse enregistrée pour votre compte.",
    retentionHeading: "Conservation de l'enregistrement du consentement",
    retentionBody:
      "Nous conservons un enregistrement du choix que vous avez fait — accepté ou refusé — comme preuve que le consentement a été demandé et de ce que vous avez répondu. Cet enregistrement est conservé à titre de preuve, même après la suppression d'un compte : il est alors dissocié de vos données personnelles, mais pas effacé.",
  },
};

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

  if (!isLocale(locale)) {
    return {
      description: COPY.nl.metaDescription,
      title: COPY.nl.metaTitle,
    };
  }

  return {
    alternates: {
      canonical: `/${locale}/privacy`,
      languages: localeAlternates("/privacy"),
    },
    description: COPY[locale].metaDescription,
    title: COPY[locale].metaTitle,
  };
}

/**
 * The page `ConsentBanner` links to.
 *
 * Scoped to what the banner's own consent decision is about — analytics —
 * rather than a full restatement of every processing activity on the site. What
 * it must say, and does say below, is: what is collected, who processes it,
 * that consent is optional and withdrawable, where to withdraw it, and that the
 * record of the decision itself outlives the account it describes.
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

  const copy = COPY[locale];

  return (
    <article className="flex max-w-3xl flex-col gap-6">
      {copy.draft && (
        <aside
          className="rounded-md bg-warning p-4 text-sm text-warning-foreground"
          role="note"
        >
          <p>{copy.draft.notice}</p>
          <a className="underline" href="/nl/privacy" hrefLang="nl" lang="nl">
            {copy.draft.authoritative}
          </a>
        </aside>
      )}

      <header className="flex flex-col gap-2">
        <h1 className="font-bold text-foreground text-xxl">{copy.metaTitle}</h1>
        <p className="text-foreground-muted text-sm">{copy.intro}</p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-foreground text-lg">
          {copy.collectHeading}
        </h2>
        <p className="text-foreground text-md">{copy.collectUsage}</p>
        <p className="text-foreground text-md">{copy.collectNotAnonymous}</p>
        <p className="text-foreground text-md">{copy.collectNoAccount}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-foreground text-lg">
          {copy.processorHeading}
        </h2>
        <p className="text-foreground text-md">
          {copy.processorBefore}
          <code className="text-sm">analytics.zias.be</code>
          {copy.processorAfter}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-foreground text-lg">
          {copy.consentHeading}
        </h2>
        <p className="text-foreground text-md">{copy.consentBody}</p>
        {/*
         * The control itself, and not a link to one somewhere else. See "The
         * withdrawal control is on this page" in the module doc comment: a
         * guest cannot reach `/{locale}/account` at all, so a promise that
         * pointed only there was a promise this site did not keep.
         */}
        <ConsentDeviceControl locale={locale} />
        <p className="text-foreground-muted text-sm">
          {copy.accountBefore}
          <a className="underline" href={`/${locale}/account`}>
            {copy.accountLink}
          </a>
          {copy.accountAfter}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-foreground text-lg">
          {copy.retentionHeading}
        </h2>
        <p className="text-foreground text-md">{copy.retentionBody}</p>
      </section>
    </article>
  );
}
