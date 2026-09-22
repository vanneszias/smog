"use client";

import { Banner, Button } from "@smog/ui-web";
import Link from "next/link";
import { useEffect, useState } from "react";
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
 * `apps/site` has no i18n library and every shipped component holds its copy
 * as a `Record<Locale, string>` at the call site (`LocaleSwitcher.tsx:11`,
 * `[locale]/layout.tsx:21`). The wording is copied verbatim from
 * `packages/i18n/src/locales/*.json`'s `settings.*` keys
 * (`analyticsPromptTitle`, `analyticsPromptDescription`, `analyticsAllow`,
 * `analyticsRequiredOnly`, `privacyPolicy`) so that this notice and the old
 * stack's say the same thing while both are live; the dependency on
 * `@smog/i18n` is deliberately not added.
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

  useEffect(() => {
    setState(readConsent());

    return subscribeConsent(() => {
      setState(readConsent());
    });
  }, []);

  if (state !== null) {
    return null;
  }

  const copy = COPY[locale];

  return (
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
        <Button onClick={() => writeConsent("granted")}>{copy.accept}</Button>
      </div>
    </Banner>
  );
}
