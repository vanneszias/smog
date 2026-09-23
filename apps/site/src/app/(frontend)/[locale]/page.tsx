import {
  Button,
  buttonVariants,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@smog/ui-web";
import { Search } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandArt } from "@/components/BrandArt";
import {
  gestureListHref,
  parseGestureListParams,
} from "@/lib/gestureListParams";
import { fetchCategoryOptions } from "@/lib/gestureQuery";
import { isLocale, type Locale, localeAlternates } from "@/lib/locale";

/** How many categories the home page offers before "all gestures". */
const HOME_CATEGORY_LIMIT = 8;

const APP_STORE_URL = "https://apps.apple.com/app/smog-co/id6758547774";
const GOOGLE_PLAY_URL =
  "https://play.google.com/store/apps/details?id=be.zias.smog";

interface HomeCopy {
  aboutBody: string;
  aboutTitle: string;
  allGestures: string;
  appBody: string;
  appStore: string;
  appTitle: string;
  categoriesTitle: string;
  description: string;
  googlePlay: string;
  heroTitle: string;
  searchButton: string;
  searchLabel: string;
  sponsorBody: string;
  sponsorCta: string;
  sponsorTitle: string;
}

/*
 * The page's copy, per locale, the way every component in this app holds its
 * strings (see `ConsentBanner.tsx`). The hero headline is the one
 * `packages/i18n` already carries as `web.home.heroTitle`.
 *
 * The copy for "what SMOG is", "get the app" and "sponsor" is a first draft
 * that still awaits the owner's review, in all three languages.
 *
 * The French spaces before `:`, `?` and inside `« »` are no-break spaces
 * (`\u00a0`), as French typography has them, so the punctuation never wraps
 * onto a line of its own. The product's name is held together the same way
 * wherever it falls in running text.
 */
const COPY: Record<Locale, HomeCopy> = {
  en: {
    aboutBody:
      "SMOG stands for “Spreken Met Ondersteuning van Gebaren”: speaking with the support of gestures. You speak as you always do and back up the key words with a gesture, which makes language visible to people who find speech hard to follow. This site collects those gestures so you can look them up, watch them and save them.",
    aboutTitle: "What is SMOG?",
    allGestures: "See all gestures",
    appBody: "Download the app and have the gestures at hand wherever you are.",
    appStore: "Download on the App Store",
    appTitle: "Get the app",
    categoriesTitle: "Browse by category",
    description:
      "Search SMOG gestures, browse them by category and watch how each one is signed.",
    googlePlay: "Get it on Google Play",
    heroTitle: "People naturally support their speech with gestures",
    searchButton: "Search",
    searchLabel: "Search for a gesture",
    sponsorBody:
      "Support a gesture for a year: your name appears in its video, and you help SMOG\u00a0&\u00a0Co grow.",
    sponsorCta: "Become a sponsor",
    sponsorTitle: "Sponsor a gesture",
  },
  fr: {
    aboutBody:
      "SMOG signifie «\u00a0Spreken Met Ondersteuning van Gebaren\u00a0»\u00a0: parler avec le soutien de gestes. On parle comme d'habitude et on appuie les mots importants d'un geste, ce qui rend la langue visible pour les personnes qui ont du mal à suivre la parole. Ce site rassemble ces gestes pour que vous puissiez les rechercher, les regarder et les enregistrer.",
    aboutTitle: "Qu'est-ce que SMOG\u00a0?",
    allGestures: "Voir tous les gestes",
    appBody:
      "Téléchargez l'application et gardez les gestes à portée de main, où que vous soyez.",
    appStore: "Télécharger dans l'App Store",
    appTitle: "Télécharger l'application",
    categoriesTitle: "Parcourir par catégorie",
    description:
      "Recherchez des gestes SMOG, parcourez-les par catégorie et regardez comment chacun se signe.",
    googlePlay: "Disponible sur Google Play",
    heroTitle: "Les personnes accompagnent naturellement leur parole de gestes",
    searchButton: "Rechercher",
    searchLabel: "Rechercher un geste",
    sponsorBody:
      "Soutenez un geste pendant un an\u00a0: votre nom apparaît dans sa vidéo et vous aidez SMOG\u00a0&\u00a0Co à grandir.",
    sponsorCta: "Devenir parrain",
    sponsorTitle: "Parrainer un geste",
  },
  nl: {
    aboutBody:
      "SMOG staat voor Spreken Met Ondersteuning van Gebaren. Je spreekt zoals altijd en ondersteunt de belangrijkste woorden met een gebaar, zodat taal zichtbaar wordt voor wie gesproken taal moeilijk volgt. Op deze website vind je die gebaren terug om op te zoeken, te bekijken en te bewaren.",
    aboutTitle: "Wat is SMOG?",
    allGestures: "Bekijk alle gebaren",
    appBody: "Download de app en heb de gebaren bij de hand, waar je ook bent.",
    appStore: "Download in de App Store",
    appTitle: "Download de app",
    categoriesTitle: "Blader per categorie",
    description:
      "Zoek SMOG-gebaren op, blader per categorie en bekijk hoe elk gebaar gaat.",
    googlePlay: "Ontdek het op Google Play",
    heroTitle: "Mensen ondersteunen hun spraak van nature met gebaren",
    searchButton: "Zoeken",
    searchLabel: "Zoek een gebaar",
    sponsorBody:
      "Steun een gebaar voor één jaar: jouw naam verschijnt in de video en je helpt SMOG\u00a0&\u00a0Co groeien.",
    sponsorCta: "Word sponsor",
    sponsorTitle: "Sponsor een gebaar",
  },
};

/**
 * Its own `alternates`, rather than the layout's.
 *
 * Alternates are inherited by every child segment that does not declare them
 * (see the layout), so they belong on the page whose path they describe and
 * nowhere above it. No `title`: the layout's default, the site's name, is the
 * right title for the home page.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  return {
    alternates: {
      canonical: `/${locale}`,
      languages: localeAlternates(""),
    },
    description: COPY[locale].description,
  };
}

/**
 * Rendered per request, never prerendered, for the reason the gestures list
 * gives: the layout's `generateStaticParams` makes `next build` attempt this
 * route, and the category query below would then run against the inert D1
 * placeholder `payload.config.ts` hands the build.
 */
export const dynamic = "force-dynamic";

/**
 * The categories to offer, or none when they cannot be read.
 *
 * The one place on this page that reads the database, and the page must not
 * fall over with it: before this section existed the home page issued no query
 * at all for a signed-out visitor, so a database hiccup — a locked local D1
 * while the e2e fixtures are being written is the one seen so far — would now
 * turn the front door into an error page over a list of shortcuts. The
 * section is left out instead, which is what an empty list already does, and
 * the failure is logged, not hidden.
 */
async function loadCategories(
  locale: Locale
): Promise<{ id: string; name: string }[]> {
  try {
    return await fetchCategoryOptions(locale, { limit: HOME_CATEGORY_LIMIT });
  } catch (error) {
    console.error("[home] Failed to load the categories:", error);

    return [];
  }
}

/**
 * The locale home: search, what SMOG is, a way into the categories, the app
 * and sponsoring.
 *
 * A Server Component with no client state of its own. The search box is a
 * plain `GET` form onto the gestures list — `SearchBar` cannot be used here,
 * because it renders its own `<form>`, cancels the submit and reports the
 * query through an `onSearch` callback, which a Server Component cannot pass
 * and a browser without JavaScript never calls. The list page already reads
 * `?q=`, so the form needs nothing but the input's `name`.
 *
 * The locale check is repeated from the layout on purpose: `notFound()` in a
 * layout is caught by the boundary *above* it, so the two render different
 * pages, and a page that trusts its parent serves Dutch under `/de` the day
 * someone reorders the tree.
 */
export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const copy = COPY[locale];
  const gesturesPath = `/${locale}/gestures`;
  const categories = await loadCategories(locale);
  // The list's own URL builder, so a category link is exactly the URL the
  // filter on the list page would have produced for the same choice.
  const unfiltered = parseGestureListParams(new URLSearchParams());

  return (
    <div className="flex flex-col gap-16 pb-8">
      <section
        aria-labelledby="home-title"
        className="relative flex flex-col gap-6 pt-4 md:gap-8 md:pt-8"
      >
        {/*
         * Three hands around the headline: one above it on the right, one
         * beside it on the left, one below it towards the right. Decoration
         * only, and left out below `md`, where they would squeeze the
         * headline into a column a few words wide.
         */}
        <div className="hidden justify-end md:flex">
          <BrandArt
            className="aspect-[8/7] w-20 lg:w-24"
            src="/brand/hand-1.svg"
          />
        </div>
        <h1
          className="mx-auto max-w-3xl text-balance text-center font-bold text-primary text-xl md:px-24 md:text-xxl"
          id="home-title"
        >
          {copy.heroTitle}
        </h1>
        <BrandArt
          className="absolute top-1/2 left-0 hidden aspect-[2/1] w-20 -translate-y-1/2 md:block lg:w-24"
          src="/brand/hand-2.svg"
        />
        <div className="hidden justify-end pr-24 md:flex">
          <BrandArt
            className="aspect-[2/1] w-20 lg:w-24"
            src="/brand/hand-3.svg"
          />
        </div>
        <search className="mx-auto w-full max-w-2xl">
          <form
            action={gesturesPath}
            className="flex flex-col gap-2 sm:flex-row"
            method="get"
          >
            <Label className="sr-only" htmlFor="home-search">
              {copy.searchLabel}
            </Label>
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-muted"
              />
              <Input
                className="pl-10"
                id="home-search"
                name="q"
                placeholder={copy.searchLabel}
                size="lg"
                type="search"
              />
            </div>
            <Button size="lg" type="submit">
              {copy.searchButton}
            </Button>
          </form>
        </search>
      </section>

      <section aria-labelledby="home-about" className="flex flex-col gap-3">
        <h2 className="font-bold text-foreground text-xl" id="home-about">
          {copy.aboutTitle}
        </h2>
        <p className="max-w-3xl text-foreground-muted text-md">
          {copy.aboutBody}
        </p>
      </section>

      {categories.length === 0 ? null : (
        <section
          aria-labelledby="home-categories"
          className="flex flex-col gap-4"
          data-testid="home-categories"
        >
          <h2
            className="font-bold text-foreground text-xl"
            id="home-categories"
          >
            {copy.categoriesTitle}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <li key={category.id}>
                <a
                  className={buttonVariants({ size: "md", variant: "outline" })}
                  href={gestureListHref(gesturesPath, unfiltered, {
                    categories: [category.id],
                  })}
                >
                  {category.name}
                </a>
              </li>
            ))}
          </ul>
          <p>
            <a
              className="text-md text-primary underline underline-offset-2"
              href={gesturesPath}
            >
              {copy.allGestures}
            </a>
          </p>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="home-app">
          <Card className="flex h-full flex-col">
            <CardHeader className="flex-1">
              <CardTitle asChild>
                <h2 id="home-app">{copy.appTitle}</h2>
              </CardTitle>
              <CardDescription className="text-md">
                {copy.appBody}
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex-wrap">
              <a
                className={buttonVariants({ variant: "secondary" })}
                href={APP_STORE_URL}
                rel="noopener noreferrer"
              >
                {copy.appStore}
              </a>
              <a
                className={buttonVariants({ variant: "secondary" })}
                href={GOOGLE_PLAY_URL}
                rel="noopener noreferrer"
              >
                {copy.googlePlay}
              </a>
            </CardFooter>
          </Card>
        </section>
        <section aria-labelledby="home-sponsor">
          <Card className="flex h-full flex-col">
            <CardHeader className="flex-1">
              <CardTitle asChild>
                <h2 id="home-sponsor">{copy.sponsorTitle}</h2>
              </CardTitle>
              <CardDescription className="text-md">
                {copy.sponsorBody}
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <a
                className={buttonVariants({ variant: "primary" })}
                href={`/${locale}/sponsor`}
              >
                {copy.sponsorCta}
              </a>
            </CardFooter>
          </Card>
        </section>
      </div>
    </div>
  );
}
