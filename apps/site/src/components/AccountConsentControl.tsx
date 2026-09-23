"use client";

import { ConsentDeviceControl } from "@/components/ConsentDeviceControl";
import { formatEmailDate } from "@/email/render";
import type { ConsentRecord } from "@/lib/accountConsent";
import type { Locale } from "@/lib/locale";

/**
 * The account page's consent section: the device-scoped switch, plus what
 * this account has on record.
 *
 * ## The device rule: the switch reflects this device, and only this device
 *
 * This was a live question and it was settled deliberately, against the more
 * convenient answer. The switch's state comes from `localStorage` alone — the
 * same store `ConsentBanner` and `ConsentSync` read and write — and
 * `initialConsent`, the account's own newest recorded row, is **never** read
 * into it, not even as a fallback. The reason is a shared or library
 * computer: someone signs in, and a "granted" recorded months ago on their
 * phone must not be silently applied to a machine they do not control,
 * turning tracking on with no fresh click on *this* device. The tri-state in
 * `lib/consentStore.ts` already enforces exactly that — nothing is written
 * until a real decision is made on this browser — and merging the account's
 * row into the switch would quietly undo it for every returning visitor.
 * `AccountConsentControl.test.tsx` pins two shapes of that mistake, because
 * one test proved not to be enough: "the switch is unaffected by what the
 * account's row says" passes a row that disagrees with an *explicit* local
 * decision and asserts the switch shows the local value — but a reviewer
 * showed that test alone does not catch the more realistic edit, a fallback
 * used only when `localStorage` is undecided (`initialConsent?.… ?? …`).
 * "the switch does not fall back to the account's row when this device has
 * not decided" is the second test, and it is the one that actually fails if
 * `initialConsent` is read into `checked` at all, in either branch.
 *
 * Since the switch moved into `ConsentDeviceControl` — so that the privacy
 * page can offer it to guests, who have no account page to visit — the rule
 * is also structural: that component is not given `initialConsent`, so there
 * is nothing in it to fall back to. Both tests still run against this
 * component, which is the one that receives the row, because that is where
 * the mistake would be made.
 *
 * The corollary is that a device-scoped toggle alone is not honest about what
 * it covers, so the switch's own label says "on this device" rather than
 * implying one account-wide truth, and `initialConsent` is shown *beside* it
 * — read-only, dated, never merged — so a visitor who consented elsewhere is
 * told the truth about their account rather than being shown a switch that
 * looks like a refusal when it is really "not decided here".
 *
 * ## Why this no longer posts anything
 *
 * Toggling used to call `postConsent` from here, on the reasoning that
 * `ConsentSync` "reconciles a decision that was already made — it is not the
 * channel for making one". That reasoning held only while `ConsentSync` read
 * the store once on mount, which is the defect that let a banner answer go
 * unrecorded until some later page load. `ConsentSync` now watches the store,
 * so it *is* the channel: this component writes the decision and the
 * reconciler in the layout records it, once.
 */

/** The read-only caption for the account's own newest recorded row. */
const RECORD_COPY: Record<
  Locale,
  {
    granted: string;
    noRecord: string;
    recordedOn: (choice: string, date: string) => string;
    refused: string;
  }
> = {
  en: {
    granted: "allowed",
    noRecord: "No answer is recorded for your account yet.",
    recordedOn: (choice, date) =>
      `Your account last recorded that analytics were ${choice}, on ${date}.`,
    refused: "declined",
  },
  fr: {
    granted: "autorisées",
    noRecord: "Aucune réponse n'est encore enregistrée pour votre compte.",
    recordedOn: (choice, date) =>
      `Votre compte a enregistré pour la dernière fois que les analyses étaient ${choice}, le ${date}.`,
    refused: "refusées",
  },
  nl: {
    granted: "toegestaan",
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
  const record = RECORD_COPY[locale];

  return (
    <div className="flex flex-col gap-4">
      <ConsentDeviceControl locale={locale} />
      {/*
       * Read-only, and never merged into the switch above — see "The device
       * rule" in the module doc comment. This is what makes the page honest
       * about scope: the switch alone would show "off" to someone whose account
       * says otherwise, with nothing telling them that is what is happening.
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
