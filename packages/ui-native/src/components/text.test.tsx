import { describe, expect, it } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import { renderKit, t } from "../test/render";
import { Logo } from "./logo";
import { Heading, Text } from "./text";

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
    expect(screen.getByRole("header", { name: "SMOG" })).toHaveStyle({
      fontSize: 40,
    });
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
