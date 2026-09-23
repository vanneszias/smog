import { tokens } from "@smog/styles";
import { BADGE_SIZES, BADGE_VARIANTS } from "@smog/ui-web/vocabulary";
import { render, screen } from "@testing-library/react-native";
import { resolvedColor } from "../test/resolvedColor";
import { Badge, badgeVariants } from "./Badge";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge>New</Badge>);

    expect(screen.getByText("New")).toBeOnTheScreen();
  });

  it("defaults to the neutral variant", () => {
    render(<Badge testID="subject">New</Badge>);

    expect(screen.getByTestId("subject")).not.toHaveStyle({
      backgroundColor: resolvedColor(tokens.semantic.light.primary),
    });
  });

  it("implements every variant in the shared vocabulary, distinctly", () => {
    /**
     * Same fix `Button.test.tsx` uses, copied rather than reinvented: `cva`
     * falls back to its base classes for an unrecognised variant name, and
     * that fallback is itself one distinct value, so plain distinctness
     * cannot tell "every name implemented" from "one name quietly dropped".
     * Comparing every real variant's render against the `unimplemented`
     * control's render is what actually catches the drop.
     */
    const unimplemented = badgeVariants({
      variant: "unimplemented" as (typeof BADGE_VARIANTS)[number],
    });
    const rendered = BADGE_VARIANTS.map((variant) =>
      badgeVariants({ variant })
    );

    expect(new Set(rendered).size).toBe(BADGE_VARIANTS.length);
    expect(rendered).not.toContain(unimplemented);
  });

  it("implements every size in the shared vocabulary, distinctly", () => {
    const unimplemented = badgeVariants({
      size: "unimplemented" as (typeof BADGE_SIZES)[number],
    });
    const rendered = BADGE_SIZES.map((size) => badgeVariants({ size }));

    expect(new Set(rendered).size).toBe(BADGE_SIZES.length);
    expect(rendered).not.toContain(unimplemented);
  });
});
