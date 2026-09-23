import type { Page } from "@playwright/test";

/** Mirrors `ANALYTICS_CONSENT_KEY` in `src/lib/consentStore.ts`. */
const ANALYTICS_CONSENT_KEY = "smog.consent.analytics";

/**
 * Answers the consent banner before the page ever loads.
 *
 * For a spec whose point is something else entirely — a password change, a
 * list delete, a sponsor order — driving the page with the banner
 * unanswered means fighting a fixed-position notice that a first-time
 * visitor has not seen yet, on every run. An earlier `site-e2e` failure
 * (`account.spec.ts`, `account-lists.spec.ts`, `sponsor.spec.ts`) was this
 * exactly: the banner's own "use without analytics" button intercepting a
 * click meant for the page underneath it.
 *
 * `addInitScript`, deliberately not `evaluate`. `account-favorites.spec.ts`
 * seeds guest favourites with `evaluate` *after* `page.goto`, and says why in
 * its own comment: that value is meant to be read once and then cleared by
 * a merge, so writing it after the page has already loaded — and therefore
 * re-running it on every navigation would be wrong — is the right call
 * there. A consent decision is the opposite kind of value: it is not
 * consumed, it is a standing fact the visitor already established, so
 * re-asserting it on every navigation this page fixture makes is correct,
 * not a hazard. It also has to land before the very first paint:
 * `ConsentBanner`'s mount effect reads the store once, synchronously with
 * mount, and a write arriving even a tick later would already have missed
 * it — writing from the same tab does not fire a `storage` event, so
 * nothing would tell the component to re-read.
 */
export function seedConsent(
  page: Page,
  choice: "denied" | "granted" = "granted"
) {
  return page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [ANALYTICS_CONSENT_KEY, choice] as const
  );
}
