import { tokens } from "@smog/styles";
import { BUTTON_SIZES, BUTTON_VARIANTS } from "@smog/ui-web/vocabulary";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { resolvedColor } from "../test/resolvedColor";
import { Button, buttonVariants } from "./Button";

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Press me</Button>);

    expect(screen.getByText("Press me")).toBeOnTheScreen();
  });

  it("is a button to assistive technology", () => {
    render(<Button>Press me</Button>);

    expect(screen.getByRole("button", { name: "Press me" })).toBeOnTheScreen();
  });

  it("calls onPress", () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress}>Press me</Button>);

    fireEvent.press(screen.getByRole("button"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress while disabled", () => {
    const onPress = jest.fn();
    render(
      <Button disabled onPress={onPress}>
        Press me
      </Button>
    );

    fireEvent.press(screen.getByRole("button"));

    expect(onPress).not.toHaveBeenCalled();
  });

  it("does not call onPress while loading", () => {
    const onPress = jest.fn();
    render(
      <Button loading onPress={onPress}>
        Press me
      </Button>
    );

    fireEvent.press(screen.getByRole("button"));

    expect(onPress).not.toHaveBeenCalled();
  });

  it("reports busy while loading", () => {
    /**
     * The installed `@testing-library/react-native` (13.3.3) has no
     * `toHaveAccessibilityState` matcher — it ships one matcher per state
     * (`toBeBusy`, `toBeDisabled`, `toBeChecked`, ...) instead of a generic
     * one. `toBeBusy` is that state's real equivalent here.
     */
    render(<Button loading>Press me</Button>);

    expect(screen.getByRole("button")).toBeBusy();
  });

  it("paints the primary variant with the primary token", () => {
    render(<Button testID="subject">Press me</Button>);

    expect(screen.getByTestId("subject")).toHaveStyle({
      backgroundColor: resolvedColor(tokens.semantic.light.primary),
    });
  });

  it("does not paint the ghost variant with the primary token", () => {
    render(
      <Button testID="subject" variant="ghost">
        Press me
      </Button>
    );

    expect(screen.getByTestId("subject")).not.toHaveStyle({
      backgroundColor: resolvedColor(tokens.semantic.light.primary),
    });
  });

  it("lets a caller's className win the merge", () => {
    render(
      <Button className="bg-danger" testID="subject">
        Press me
      </Button>
    );

    expect(screen.getByTestId("subject")).not.toHaveStyle({
      backgroundColor: resolvedColor(tokens.semantic.light.primary),
    });
  });

  it("implements every variant in the shared vocabulary, distinctly", () => {
    /**
     * `cva` drops only the missing dimension's own classes for a variant
     * value it does not recognise — base classes and the other dimension's
     * defaults still apply — so an unimplemented variant already renders
     * distinctly from every *implemented* one; plain distinctness would not
     * notice a name quietly dropped from this map. Comparing against
     * `unimplemented`'s render (guaranteed to hit that same fallback) is
     * what actually catches it: a real variant colliding with the fallback
     * means it stopped being implemented.
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

  it("implements every size in the shared vocabulary, distinctly", () => {
    const unimplemented = buttonVariants({
      size: "unimplemented" as (typeof BUTTON_SIZES)[number],
    });
    const rendered = BUTTON_SIZES.map((size) => buttonVariants({ size }));

    expect(new Set(rendered).size).toBe(BUTTON_SIZES.length);
    expect(rendered).not.toContain(unimplemented);
  });
});
