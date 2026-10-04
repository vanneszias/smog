/**
 * The sponsor routes keep a failure on the page, localized (fix wave I-1):
 * without an `errorComponent` an error that escapes the wizard or the
 * re-edit page reaches TanStack's default, English, developer-styled error
 * UI. The preview's own failures stay inside the preview
 * (`PreviewSlot`'s boundary, `sponsor-preview.test.tsx`).
 */
import { describe, expect, test } from "bun:test";
import { RouteError } from "@/components/learning/page";

const { Route: SponsorRoute } = await import("@/routes/sponsor/index");
const { Route: EditRoute } = await import("@/routes/sponsor/edit");

describe("the sponsor routes' error component", () => {
  test("/sponsor and /sponsor/edit show the site's localized RouteError", () => {
    expect(SponsorRoute.options.errorComponent).toBe(RouteError);
    expect(EditRoute.options.errorComponent).toBe(RouteError);
  });
});
