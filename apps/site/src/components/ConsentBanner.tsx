"use client";

import { Banner, Button } from "@smog/ui-web";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  type ConsentState,
  readConsent,
  subscribeConsent,
  writeConsent,
} from "@/lib/consentStore";
import type { Locale } from "@/lib/locale";

/**
 * The cookie and analytics notice.
 *
 * ## Why it renders nothing on the server
 *
 * The answer lives in `localStorage`, which the server cannot read, so the
 * first client render has to match the empty markup the server produced and
 * the real state has to arrive in an effect. `state` therefore starts at
 * `undefined` — a fourth value, distinct from the store's three — meaning
 * "not yet read". `ThemeToggle.tsx:28-30` carries the same rule for the same
 * reason: "rendering a guess would be a hydration mismatch on every load".
 *
 * ## Why the strings are a map and not a translation call
 *
 * `apps/site` has no i18n library and every component holds its copy
 * as a `Record<Locale, string>` at the call site (`LocaleSwitcher.tsx:11`,
 * `[locale]/layout.tsx:21`). The wording is copied verbatim from
 * `packages/i18n/src/locales/*.json`'s `settings.*` keys
 * (`analyticsPromptTitle`, `analyticsPromptDescription`, `analyticsAllow`,
 * `analyticsRequiredOnly`, `privacyPolicy`) so that this notice and the
 * mobile app's say the same thing; the dependency on `@smog/i18n` is
 * deliberately not added.
 */
const COPY: Record<
  Locale,
  {
    accept: string;
    decline: string;
    description: string;
    policy: string;
    title: string;
  }
> = {
  en: {
    accept: "Allow analytics",
    decline: "Use without analytics",
    description:
      "With your permission, we collect limited usage analytics to understand how SMOG & Co is used and improve the app. We do not use this data for advertising or track you across other apps or websites.",
    policy: "Read the privacy policy",
    title: "Help improve SMOG",
  },
  fr: {
    accept: "Autoriser l'analyse",
    decline: "Utiliser sans analyse",
    description:
      "Avec votre autorisation, nous collectons des données d'analyse limitées pour comprendre comment SMOG & Co est utilisé et améliorer l'application. Nous n'utilisons pas ces données à des fins publicitaires et ne vous suivons pas dans d'autres applications ou sur d'autres sites web.",
    policy: "Lire la politique de confidentialité",
    title: "Aidez-nous à améliorer SMOG",
  },
  nl: {
    accept: "Analytics toestaan",
    decline: "Gebruiken zonder analytics",
    description:
      "Met uw toestemming verzamelen we beperkte gebruiksanalytics om te begrijpen hoe SMOG & Co wordt gebruikt en de app te verbeteren. We gebruiken deze gegevens niet voor advertenties en volgen u niet in andere apps of op andere websites.",
    policy: "Lees het privacybeleid",
    title: "Help SMOG verbeteren",
  },
};

export function ConsentBanner({ locale }: { locale: Locale }) {
  /** `undefined` is "not read yet"; `null` is "read, and they have not answered". */
  const [state, setState] = useState<ConsentState | undefined>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);
  /**
   * Reserved page-bottom space, exactly the banner's own rendered height.
   *
   * `Banner` is `position: fixed`, which is what keeps a real modal scrim out
   * of this component (see `Banner.tsx`'s own doc comment) but which also
   * means it takes no space in the document flow — so with nothing else
   * done, it sits on top of whatever the last thing on the page happens to
   * be. On `/nl/account`, `/nl/account/lists/:id` and the sponsor wizard that
   * "whatever" is a submit button, and Playwright's real click caught it
   * first: `<section aria-label="Help SMOG verbeteren" …> intercepts pointer
   * events`. A fixed element covering an interactive one is exactly the
   * consent-wall failure `Banner`'s design doc rules out — it had just moved
   * from "traps focus inside the notice" to "blocks a control the notice
   * isn't even part of".
   *
   * Measured rather than guessed, because the banner's own height is not
   * constant: it wraps to two rows under ~640px (`Banner.tsx`'s
   * `sm:flex-row`), and three different browser widths in this app's own
   * e2e suite would each need a different hardcoded number, with no signal
   * when a future copy change makes today's guess wrong again.
   * `ResizeObserver` is the one API that reports an element's *rendered*
   * box without polling, so the spacer tracks the real element instead of a
   * number one commit will eventually drift from.
   */
  const [reservedSpace, setReservedSpace] = useState(0);

  useEffect(() => {
    setState(readConsent());

    return subscribeConsent(() => {
      setState(readConsent());
    });
  }, []);

  useEffect(() => {
    if (state !== null) {
      // Answered, or not yet read: either way there is nothing to reserve
      // space for. This is also what keeps the reservation from outliving
      // the banner — a visitor who has already decided gets zero dead space
      // at the foot of every page, forever, not a leftover gap.
      return;
    }

    const section = wrapperRef.current?.querySelector("section");

    if (!section || typeof ResizeObserver === "undefined") {
      // jsdom (this component's own unit tests) has no `ResizeObserver`.
      // Skipping the reservation there is correct, not a gap: those tests
      // assert copy, state transitions and clicks, none of which depend on
      // pixel geometry, and a real browser is what Step 4(a) below is
      // actually verified against.
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setReservedSpace(entry.contentRect.height);
    });

    observer.observe(section);

    return () => observer.disconnect();
  }, [state]);

  if (state !== null) {
    return null;
  }

  const copy = COPY[locale];

  return (
    <>
      <div ref={wrapperRef}>
        <Banner label={copy.title}>
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-foreground">{copy.title}</p>
            <p className="text-foreground-muted text-sm">
              {copy.description}{" "}
              <Link className="underline" href={`/${locale}/privacy`}>
                {copy.policy}
              </Link>
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button onClick={() => writeConsent("denied")} variant="secondary">
              {copy.decline}
            </Button>
            <Button onClick={() => writeConsent("granted")}>
              {copy.accept}
            </Button>
          </div>
        </Banner>
      </div>
      {/*
       * The spacer, not the banner: `Banner`'s own root is `position: fixed`,
       * so it takes no flow height regardless of where this component sits in
       * the tree — nothing here would push page content if this div were
       * absent. Rendered as a sibling rather than as padding on `<main>`
       * because `ConsentBanner` is a client leaf and `[locale]/layout.tsx` is a
       * Server Component with no state to hold this height in; a plain flow
       * element after `<main>` in that layout achieves the same reserved space
       * without inventing a channel to pass a number up to a server parent.
       */}
      <div aria-hidden="true" style={{ height: reservedSpace }} />
    </>
  );
}
