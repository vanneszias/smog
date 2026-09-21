import { describe, expect, it } from "vitest";
import { badgeVariants } from "./components/Badge";
import { buttonVariants } from "./components/Button";
import { BADGE_VARIANTS, BUTTON_SIZES, BUTTON_VARIANTS } from "./vocabulary";

/**
 * The vocabulary is the cross-platform contract, so it is asserted against
 * the components rather than trusted.
 *
 * Distinctness is the load-bearing part. `cva` returns its base classes for
 * a variant it has never heard of, so "every name produces a class string"
 * passes for a variant that was never implemented. Requiring the strings to
 * differ from each other is what catches a name in the vocabulary that the
 * component does not actually have.
 */
describe("the shared vocabulary", () => {
  it("has a distinct implementation for every button variant", () => {
    /**
     * `cva` drops only the missing dimension's own classes for a variant
     * value it does not recognise — base classes and the other dimension's
     * defaults still apply — so an unimplemented variant already renders
     * distinctly from every *implemented* one; plain distinctness would not
     * notice a name added to the vocabulary with no matching component
     * implementation. Comparing against `unimplemented`'s render
     * (guaranteed to hit that same fallback) is what actually catches it: a
     * vocabulary entry colliding with the fallback means nothing implements
     * it.
     */
    const unimplemented = buttonVariants({
      variant: "unimplemented" as (typeof BUTTON_VARIANTS)[number],
    });
    const rendered = BUTTON_VARIANTS.map((variant) =>
      buttonVariants({ variant })
    );

    expect(new Set(rendered).size).toBe(BUTTON_VARIANTS.length);
    expect(rendered).not.toContain(unimplemented);
  });

  it("has a distinct implementation for every button size", () => {
    const unimplemented = buttonVariants({
      size: "unimplemented" as (typeof BUTTON_SIZES)[number],
    });
    const rendered = BUTTON_SIZES.map((size) => buttonVariants({ size }));

    expect(new Set(rendered).size).toBe(BUTTON_SIZES.length);
    expect(rendered).not.toContain(unimplemented);
  });

  it("has a distinct implementation for every badge variant", () => {
    const unimplemented = badgeVariants({
      variant: "unimplemented" as (typeof BADGE_VARIANTS)[number],
    });
    const rendered = BADGE_VARIANTS.map((variant) =>
      badgeVariants({ variant })
    );

    expect(new Set(rendered).size).toBe(BADGE_VARIANTS.length);
    expect(rendered).not.toContain(unimplemented);
  });

  it("names a variant the component does not have as a failure", () => {
    /**
     * `cva` does not fall back to `defaultVariants` for an explicit value it
     * does not recognise — it just omits that variant's classes, so a
     * single unknown name renders its own distinct (if incomplete) string
     * and would not collide with anything. Two unimplemented names both
     * fall back the same way, so they collide with *each other*, and that
     * collision is what this self-check needs: proof that the distinctness
     * assertion actually fires when a name is unimplemented, rather than
     * trivially passing every time.
     */
    const withUnknown = [
      ...BUTTON_VARIANTS,
      "nonsense-a",
      "nonsense-b",
    ] as const;
    const rendered = withUnknown.map((variant) =>
      buttonVariants({ variant: variant as (typeof BUTTON_VARIANTS)[number] })
    );

    expect(new Set(rendered).size).not.toBe(withUnknown.length);
  });
});
