"use client";

import { Switch } from "@smog/ui-web";
import { useEffect, useState } from "react";
import { postConsent } from "@/components/ConsentSync";
import { formatEmailDate } from "@/email/render";
import type { ConsentRecord } from "@/lib/accountConsent";
import { readConsent, writeConsent } from "@/lib/consentStore";
import type { Locale } from "@/lib/locale";

/**
 * The account page's re-toggle: the control the privacy page (Task 4)
 * promises exists, so a signed-in visitor can withdraw — or give — analytics
 * consent after the fact.
 *
 * ## Ruling: the switch reflects this device, and only this device
 *
 * This was a live question and it was settled deliberately, against the
 * more convenient answer. The switch's state comes from `localStorage`
 * alone — the same store `ConsentBanner` and `ConsentSync` read and write —
 * and `initialConsent`, the account's own newest recorded row, is **never**
 * read into it, not even as a fallback. The reason is a shared or library
 * computer: someone signs in, and a "granted" recorded months ago on their
 * phone must not be silently applied to a machine they do not control,
 * turning tracking on with no fresh click on *this* device. The tri-state in
 * `lib/consentStore.ts` already enforces exactly that — nothing is written
 * until a real decision is made on this browser — and merging the account's
 * row into the switch would quietly undo it for every returning visitor.
 * `AccountConsentControl.test.tsx`'s "the switch is unaffected by what the
 * account's row says" pins this: it passes a row that disagrees with
 * `localStorage` and asserts the switch still shows the local value, so a
 * future edit that wires the row into `checked` fails that test by name.
 *
 * The corollary is that a device-scoped toggle alone is not honest about
 * what it covers, so the label below says "on this device" rather than
 * implying one account-wide truth, and `initialConsent` is shown *beside*
 * the switch — read-only, dated, never merged — so a visitor who consented
 * elsewhere is told the truth about their account rather than being shown a
 * switch that looks like a refusal when it is really "not decided here".
 *
 * ## Why the initial switch value still starts undecided rather than guessing
 *
 * The decision lives in `localStorage`, which the server cannot read, so the
 * account page — a Server Component — cannot render the switch's initial
 * state. `checked` therefore starts `undefined` and the switch renders only
 * once an effect has read the real value, the same rule `ConsentBanner.tsx`
 * and `ThemeToggle.tsx:28-30` both carry for the same reason: guessing here
 * would be a hydration mismatch on every load. `initialConsent`, by
 * contrast, *is* known on the server — it is a plain read of an already-
 * resolved account, not a value that can disagree between server and client
 * render — so that half renders immediately, the same way `FavoriteButton`
 * renders its signed-in state without an `undefined` step.
 *
 * ## Why toggling calls `postConsent` directly instead of waiting for
 * `ConsentSync`
 *
 * `ConsentSync` reconciles a decision that was already made — it is not the
 * channel for making one. An explicit toggle here is a new decision the
 * moment it happens, and the two calls it makes (`writeConsent`, then
 * `postConsent`) are exactly the mechanism `ConsentSync` itself uses once
 * there is a decision to send, kept in the one module that owns the POST so
 * there is only ever one way this app talks to `/api/consent`.
 */

/**
 * Device-scoped wording for the toggle itself.
 *
 * `label` reuses `packages/i18n`'s `settings.analyticsAllow` verbatim, with a
 * device-scope suffix appended — the same "copied from the shared strings,
 * not imported" convention `ConsentBanner.tsx` documents for its own copy,
 * which is why this is a hand-written literal rather than a dependency on
 * `@smog/i18n`. `settings.analyticsPromptTitle`/`analyticsPromptDescription`
 * describe the banner's one-time prompt rather than a persistent, revisitable
 * control, so they are not the key being reused here. `description` has no
 * existing key at all — nothing in `packages/i18n` says a decision is
 * scoped to one device — so it is written plainly.
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

/** The read-only caption for the account's own newest recorded row. */
const RECORD_COPY: Record<
  Locale,
  {
    granted: string;
    heading: string;
    noRecord: string;
    recordedOn: (choice: string, date: string) => string;
    refused: string;
  }
> = {
  en: {
    granted: "allowed",
    heading: "On record for your account",
    noRecord: "No answer is recorded for your account yet.",
    recordedOn: (choice, date) =>
      `Your account last recorded that analytics were ${choice}, on ${date}.`,
    refused: "declined",
  },
  fr: {
    granted: "autorisées",
    heading: "Enregistré pour votre compte",
    noRecord: "Aucune réponse n'est encore enregistrée pour votre compte.",
    recordedOn: (choice, date) =>
      `Votre compte a enregistré pour la dernière fois que les analyses étaient ${choice}, le ${date}.`,
    refused: "refusées",
  },
  nl: {
    granted: "toegestaan",
    heading: "Geregistreerd voor je account",
    noRecord: "Er is nog geen antwoord geregistreerd voor je account.",
    recordedOn: (choice, date) =>
      `Je account registreerde laatst dat analytics ${choice} waren, op ${date}.`,
    refused: "geweigerd",
  },
};

export function AccountConsentControl({
  initialConsent,
  locale,
}: {
  initialConsent: ConsentRecord | null;
  locale: Locale;
}) {
  const [checked, setChecked] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    // Only ever `localStorage`. See "Ruling" above.
    setChecked(readConsent() === "granted");
  }, []);

  const device = DEVICE_COPY[locale];
  const record = RECORD_COPY[locale];

  const handleCheckedChange = (next: boolean) => {
    // Reflected immediately: a visitor who flips this and navigates away
    // must see it stick, not wait on the network round trip.
    setChecked(next);
    writeConsent(next ? "granted" : "denied");
    // Not awaited: this is a mount-effect-shaped fire-and-forget, and
    // `postConsent` never throws. A failed POST leaves `ConsentSync`'s sync
    // marker unset, so the next signed-in page load retries it.
    postConsent(next);
  };

  return (
    <div className="flex flex-col gap-4">
      {checked === undefined ? null : (
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground text-sm">
              {device.label}
            </p>
            <p className="text-foreground-muted text-sm">
              {device.description}
            </p>
          </div>
          <Switch
            aria-label={device.label}
            checked={checked}
            data-testid="analytics-consent-switch"
            onCheckedChange={handleCheckedChange}
          />
        </div>
      )}
      {/*
       * Read-only, and never merged into `checked` above — see "Ruling" in
       * the module doc comment. This is what makes the page honest about
       * scope: the switch alone would show "off" to someone whose account
       * says otherwise, with nothing telling them that is what is
       * happening.
       */}
      <p
        className="text-foreground-muted text-sm"
        data-testid="account-consent-record"
      >
        {initialConsent === null
          ? record.noRecord
          : record.recordedOn(
              initialConsent.analyticsConsent ? record.granted : record.refused,
              formatEmailDate(initialConsent.recordedAt, locale)
            )}
      </p>
    </div>
  );
}
