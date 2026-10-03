/**
 * App-wide switches that a release may need to flip without touching the
 * screens.
 *
 * `SPONSOR_LINK_IN_APP` (ruling 13, App Store guideline 3.1.1): the gesture
 * screen's "Sponsor now" opens the site's wizard in the system browser,
 * which App Review may question as a purchase outside in-app purchase. Set
 * it to `false` to drop that link on iOS (the card still says who sponsors
 * the gesture); Android keeps it. The phase 8 store-submission carry
 * decides the value for the first iOS review.
 */
export const SPONSOR_LINK_IN_APP = true;
