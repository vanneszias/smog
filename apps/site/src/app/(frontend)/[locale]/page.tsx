import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";

/**
 * The locale root, so `/` has somewhere to redirect to.
 *
 * Deliberately thin. Stage 3's remaining tasks build the gestures list, the
 * detail page, favorites and lists; this exists because a redirect that lands
 * on a 404 is a broken redirect, and because the layout above it needs a page
 * to wrap before any of it can be looked at in a browser.
 *
 * It repeats the layout's locale check rather than trusting it: `notFound()`
 * in the layout is caught by the boundary *above* the layout, so the two
 * calls render different pages, and a page that assumes its parent validated
 * the segment is a page that renders Dutch under `/de` the day someone
 * reorders the tree.
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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-bold text-foreground text-xxl">SMOG</h1>
      <p className="max-w-3xl text-foreground-muted text-md">
        Gebaren opzoeken, bekijken en bewaren.
      </p>
      <p>
        <a
          className="text-md text-primary underline underline-offset-2"
          href={`/${locale}/gestures`}
        >
          Bekijk alle gebaren
        </a>
      </p>
    </div>
  );
}
