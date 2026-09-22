"use client";

import { Switch } from "@smog/ui-web";
import { useEffect, useState } from "react";
import { postConsent } from "@/components/ConsentSync";
import { readConsent, writeConsent } from "@/lib/consentStore";

/**
 * The account page's re-toggle: the control the privacy page (Task 4)
 * promises exists, so a signed-in visitor can withdraw — or give — analytics
 * consent after the fact.
 *
 * ## Why it starts undecided rather than guessing
 *
 * The decision lives in `localStorage`, which the server cannot read, so the
 * account page — a Server Component — cannot render this control's initial
 * state. `state` therefore starts `undefined` and the switch renders only
 * once an effect has read the real value, the same rule `ConsentBanner.tsx`
 * and `ThemeToggle.tsx:28-30` both carry for the same reason: guessing here
 * would be a hydration mismatch on every load.
 *
 * ## Why it reflects the browser, not the account's newest server row
 *
 * This app's whole design keeps the decision in the browser
 * (`lib/consentStore.ts`'s doc comment) and treats `user-consents` as the
 * evidence trail that decision produces, not a second copy of it to read
 * back. Reading the newest row instead would need a fetch this page does not
 * otherwise make, and would still disagree with what `ConsentBanner` shows on
 * the very same visit if the two ever raced — one source of truth avoids
 * that by construction. The cost is the one `lib/consentStore.ts` already
 * accepts: a visitor who answered on a different browser sees "not decided"
 * here until they decide again on this one, exactly as the banner would show
 * them the prompt again.
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
export function AccountConsentControl() {
  const [checked, setChecked] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    setChecked(readConsent() === "granted");
  }, []);

  if (checked === undefined) {
    return null;
  }

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
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground text-sm">
          Analytics toestaan
        </p>
        <p className="text-foreground-muted text-sm">
          Help ons SMOG te verbeteren door beperkte gebruiksanalytics toe te
          staan. Je kan deze toestemming op elk moment intrekken.
        </p>
      </div>
      <Switch
        aria-label="Analytics toestaan"
        checked={checked}
        data-testid="analytics-consent-switch"
        onCheckedChange={handleCheckedChange}
      />
    </div>
  );
}
