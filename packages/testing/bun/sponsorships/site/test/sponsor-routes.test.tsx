/**
 * The sponsor routes keep a failure on the page, localized (fix wave I-1):
 * without an `errorComponent` an error that escapes the wizard or the
 * re-edit page reaches TanStack's default, English, developer-styled error
 * UI.
 */
import { describe, expect, test } from "bun:test";
import { RouteError } from "../../../../../../apps/site/src/components/learning/page";

const { Route: SponsorRoute } = await import(
  "../../../../../../apps/site/src/routes/sponsor/index"
);
const { Route: EditRoute } = await import(
  "../../../../../../apps/site/src/routes/sponsor/edit"
);

describe("the sponsor routes' error component", () => {
  test("/sponsor and /sponsor/edit show the site's localized RouteError", () => {
    expect(SponsorRoute.options.errorComponent).toBe(RouteError);
    expect(EditRoute.options.errorComponent).toBe(RouteError);
  });
});
