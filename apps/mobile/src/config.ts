/**
 * App-wide switches that a release may need to flip without touching the
 * screens.
 *
 * `SPONSOR_LINK_IN_APP` (ruling 13, App Store guideline 3.1.1): the gesture
 * screen's "Sponsor now" opens the site's wizard in the system browser,
 * which App Review may question as a purchase outside in-app purchase. Set
 * it to `false` to drop that link on iOS (the card still says who sponsors
 * the gesture); Android keeps it. It stays `true` for the first iOS review,
 * with `false` as the written-down 3.1.1 fallback (docs/DECISIONS.md, phase 8
 * task 6).
 */
export const SPONSOR_LINK_IN_APP = true;
