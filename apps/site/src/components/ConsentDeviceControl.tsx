"use client";

import { Switch } from "@smog/ui-web";
import { useEffect, useState } from "react";
import {
  readConsent,
  subscribeConsent,
  writeConsent,
} from "@/lib/consentStore";
import type { Locale } from "@/lib/locale";

/**
 * The analytics switch: give or withdraw consent, on this device.
 *
 * ## Why it is its own component, and not part of the account page
 *
 * It used to live inside `AccountConsentControl`, which renders only on
 * `/{locale}/account` — a page that redirects a signed-out visitor to
 * `/sign-in`. So the only way anyone could change their mind was to have an
 * account and be signed into it, while `ConsentBanner` returns `null` the
 * moment it is answered and the privacy policy told every reader, account or
 * not, that consent "kan altijd worden ingetrokken". For a guest that was
 * simply untrue: they could grant, and then had no way back.
 *
 * **Ruling: the control goes on the privacy page itself, for everybody.** The
 * decision is device-scoped and needs no account to hold it — that is the
 * whole design of `lib/consentStore.ts` — so nothing about withdrawing it
 * requires one either. A guest gets this switch; a signed-in visitor gets the
 * account page's richer version, which is this same component plus the
 * read-only record of what their account has on file. The shared half is
 * extracted rather than copied, so the two pages cannot drift into offering
 * two different switches for one decision.
 *
 * ## Ruling 11 lives here now
 *
 * The switch's state comes from `localStorage` alone. The account's own
 * recorded row is never read into it, not even as a fallback when this device
 * is undecided — see `AccountConsentControl`'s doc comment for the shared- or
 * library-computer reasoning that settled it, and for the two tests that pin
 * it. This component makes that structurally easier to keep: it does not
 * receive the account's row at all, so there is nothing here to fall back to.
 *
 * ## It writes the store, and nothing else
 *
 * No POST. `ConsentSync`, mounted in `[locale]/layout.tsx` on every page,
 * watches the store and is the one thing in this app that talks to
 * `/api/consent`. This component used to post as well, which was right while
 * `ConsentSync` only read the store on mount and wrong the moment it started
 * watching it: two writers, one toggle, two rows in an append-only table.
 *
 * For a guest there is no account to post to and so nothing is sent, which is
 * the same rule the banner already follows — the decision waits in the
 * browser until there is an account to attach it to.
 *
 * ## Why the initial value starts undecided rather than guessing
 *
 * The decision lives in `localStorage`, which the server cannot read, so
 * `checked` starts `undefined` and the switch renders only once an effect has
 * read the real value — the same rule `ConsentBanner.tsx` and
 * `ThemeToggle.tsx:28-30` both carry, for the same reason: guessing here
 * would be a hydration mismatch on every load.
 *
 * The subscription that follows that first read is what keeps two controls
 * for one decision honest: answer the banner while the privacy page is open
 * and this switch moves with it, rather than showing the reader a stale
 * "off" beside a notice that has just been dismissed.
 */

/**
 * Device-scoped wording for the toggle.
 *
 * `label` reuses `packages/i18n`'s `settings.analyticsAllow` verbatim, with a
 * device-scope suffix appended — the same "copied from the shared strings,
 * not imported" convention `ConsentBanner.tsx` documents for its own copy,
 * which is why this is a hand-written literal rather than a dependency on
 * `@smog/i18n`. `settings.analyticsPromptTitle`/`analyticsPromptDescription`
 * describe the banner's one-time prompt rather than a persistent, revisitable
 * control, so they are not the key being reused here. `description` has no
 * existing key at all — nothing in `packages/i18n` says a decision is scoped
 * to one device — so it is written plainly.
 */
const DEVICE_COPY: Record<Locale, { description: string; label: string }> = {
  en: {
    description:
      "This applies only to this device. Signing in elsewhere does not carry it over, and a decision made elsewhere is never applied here automatically.",
    label: "Allow analytics on this device",
  },
  fr: {
    description:
      "Ce réglage ne s'applique qu'à cet appareil. Une connexion sur un autre appareil ne le reprend pas, et une décision prise ailleurs n'est jamais appliquée ici automatiquement.",
    label: "Autoriser l'analyse sur cet appareil",
  },
  nl: {
    description:
      "Dit geldt alleen voor dit apparaat. Aanmelden op een ander apparaat neemt deze keuze niet over, en een keuze die daar gemaakt is, wordt hier nooit automatisch toegepast.",
    label: "Analytics toestaan op dit apparaat",
  },
};

export function ConsentDeviceControl({ locale }: { locale: Locale }) {
  const [checked, setChecked] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    // Only ever `localStorage`. See "Ruling 11 lives here now" above.
    const read = () => setChecked(readConsent() === "granted");

    read();

    return subscribeConsent(read);
  }, []);

  const device = DEVICE_COPY[locale];

  if (checked === undefined) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground text-sm">{device.label}</p>
        <p className="text-foreground-muted text-sm">{device.description}</p>
      </div>
      <Switch
        aria-label={device.label}
        checked={checked}
        data-testid="analytics-consent-switch"
        onCheckedChange={(next: boolean) => {
          /*
           * Reflected immediately rather than waiting for the store's
           * notification to come back round: a visitor who flips this and
           * navigates away must see it stick. `writeConsent` notifies too,
           * and the subscriber setting the same value again is a no-op.
           */
          setChecked(next);
          writeConsent(next ? "granted" : "denied");
        }}
      />
    </div>
  );
}
