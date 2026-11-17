import { describe, expect, it } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import { Logo } from "../../../../../ui-native/src/components/logo";
import { Heading, Text } from "../../../../../ui-native/src/components/text";
import { renderKit, t } from "../../../../support/ui-native/render";

describe("Text", () => {
  it("renders body copy at the body size by default", async () => {
    await renderKit(<Text testID="text">Hello</Text>);
    expect(screen.getByTestId("text")).toHaveStyle({
      fontSize: 16,
      lineHeight: 24,
    });
  });

  it("takes the caption size", async () => {
    await renderKit(
      <Text size="caption" testID="text">
        Hello
      </Text>
    );
    expect(screen.getByTestId("text")).toHaveStyle({ fontSize: 12 });
  });
});

describe("Heading", () => {
  it("is a header whose size follows its level", async () => {
    await renderKit(<Heading level={1}>Gestures</Heading>);
    const heading = screen.getByRole("header", { name: "Gestures" });
    expect(heading).toHaveStyle({ fontSize: 28 });
  });

  it("lets `size` override the level", async () => {
    await renderKit(
      <Heading level={2} size="display">
        SMOG
      </Heading>
    );
    const heading = screen.getByRole("header", { name: "SMOG" });
    expect(heading).toHaveStyle({
      fontFamily: "Figtree-Bold",
      fontSize: 40,
      lineHeight: 44,
    });
    // The display tracking, -0.022em of 40 pt.
    const style = Object.assign(
      {},
      ...[heading.props.style].flat(Number.POSITIVE_INFINITY)
    ) as { letterSpacing?: number };
    expect(style.letterSpacing).toBeCloseTo(-0.88, 2);
  });

  it("caps text-size growth at 1.5 on display and title-1 only", async () => {
    await renderKit(
      <>
        <Heading size="display">Display</Heading>
        <Heading level={1}>Title</Heading>
        <Heading level={2}>Section</Heading>
        <Text>Body</Text>
        <Heading maxFontSizeMultiplier={2} size="display">
          Own cap
        </Heading>
      </>
    );
    const cap = (name: string): unknown =>
      screen.getByRole("header", { name }).props.maxFontSizeMultiplier;
    expect(cap("Display")).toBe(1.5);
    expect(cap("Title")).toBe(1.5);
    expect(cap("Section")).toBeUndefined();
    expect(cap("Own cap")).toBe(2);
    expect(
      screen.getByText("Body").props.maxFontSizeMultiplier
    ).toBeUndefined();
  });
});

describe("Logo", () => {
  it("is an image named by a11y.logo", async () => {
    await renderKit(<Logo />);
    expect(
      screen.getByRole("image", { name: t("a11y.logo") })
    ).toBeOnTheScreen();
  });

  it("is hidden from assistive tech when decorative", async () => {
    await renderKit(<Logo decorative testID="logo" />);
    expect(screen.queryByRole("image")).toBeNull();
    expect(
      screen.getByTestId("logo", { includeHiddenElements: true })
    ).toBeTruthy();
  });

  it("is 32 pt tall at md", async () => {
    await renderKit(<Logo testID="logo" />);
    // The horizontal viewBox is 2666.67 × 578.88.
    expect(screen.getByTestId("logo")).toHaveStyle({ height: 32, width: 147 });
  });
});
