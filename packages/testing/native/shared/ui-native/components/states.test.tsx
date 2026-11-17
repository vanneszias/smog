import { describe, expect, it, jest } from "@jest/globals";
import { handSvgs } from "@smog/brand/svg";
import { themeVars } from "@smog/styles/native";
import { tokens } from "@smog/styles/tokens";
import { fireEvent, screen } from "@testing-library/react-native";
import { View } from "react-native";
import { Button } from "../../../../../ui-native/src/components/button";
import { EmptyState } from "../../../../../ui-native/src/components/empty-state";
import { ErrorState } from "../../../../../ui-native/src/components/error-state";
import { OfflineBanner } from "../../../../../ui-native/src/components/offline-banner";
import { ProgressBar } from "../../../../../ui-native/src/components/progress-bar";
import { Skeleton } from "../../../../../ui-native/src/components/skeleton";
import { Spinner } from "../../../../../ui-native/src/components/spinner";
import {
  FavoritesEmptyState,
  ListsEmptyState,
  NoResultsEmptyState,
  SearchIdleEmptyState,
} from "../../../../../ui-native/src/domain/empty-states";
import { rgba } from "../../../../support/ui-native/colour";
import { renderKit, t } from "../../../../support/ui-native/render";

// SvgXml as a plain view that keeps its `xml`, so a test can tell which
// hand is drawn (the real one parses it into shapes).
jest.mock("react-native-svg", () => {
  const actual =
    jest.requireActual<typeof import("react-native-svg")>("react-native-svg");
  const react = jest.requireActual<typeof import("react")>("react");
  const native =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ...actual,
    SvgXml: (props: { xml: string }) =>
      react.createElement(native.View, { testID: "svg-xml", xml: props.xml }),
  };
});

/** The `xml` of every SvgXml drawn (hidden ones included). */
function drawnSvgs(): unknown[] {
  return screen
    .queryAllByTestId("svg-xml", { includeHiddenElements: true })
    .map((node) => node.props.xml);
}

describe("Skeleton", () => {
  it("is hidden from assistive tech", async () => {
    await renderKit(<Skeleton shape="circle" testID="skeleton" />);
    const skeleton = screen.getByTestId("skeleton", {
      includeHiddenElements: true,
    });
    expect(skeleton.props.importantForAccessibility).toBe(
      "no-hide-descendants"
    );
    expect(skeleton.props.accessibilityElementsHidden).toBe(true);
  });
});

describe("Spinner", () => {
  it("is decorative", async () => {
    await renderKit(<Spinner testID="spinner" />);
    expect(screen.queryByTestId("spinner")).toBeNull();
    expect(
      screen.getByTestId("spinner", { includeHiddenElements: true })
    ).toBeTruthy();
  });
});

describe("EmptyState", () => {
  it("defaults to the states.empty copy and shows the next action", async () => {
    await renderKit(
      <EmptyState action={<Button>Browse</Button>} illustration />
    );
    expect(
      screen.getByRole("header", { name: t("states.empty.title") })
    ).toBeOnTheScreen();
    expect(screen.getByText(t("states.empty.description"))).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Browse" })).toBeOnTheScreen();
  });
});

describe("ErrorState", () => {
  it("is an alert with a retry button", async () => {
    const onRetry = jest.fn();
    await renderKit(<ErrorState onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      new RegExp(t("states.error.title"))
    );
    await fireEvent.press(
      screen.getByRole("button", { name: t("states.retry") })
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows the open palm on a 96 pt pale red disc, as the web, hidden from assistive tech", async () => {
    await renderKit(
      <View style={themeVars.light}>
        <ErrorState />
      </View>
    );
    const disc = screen.getByTestId("error-illustration", {
      includeHiddenElements: true,
    });
    expect(disc.props.accessibilityElementsHidden).toBe(true);
    expect(disc).toHaveStyle({
      backgroundColor: rgba(tokens.color.light.dangerSubtle),
      height: 96,
      width: 96,
    });
    expect(drawnSvgs()).toContain(handSvgs[2]);
  });

  it("shows the busy retry while retrying", async () => {
    await renderKit(<ErrorState onRetry={jest.fn()} retrying />);
    expect(screen.getByRole("button", { name: t("states.retry") })).toBeBusy();
  });
});

describe("OfflineBanner", () => {
  it("is a polite live region while offline", async () => {
    await renderKit(<OfflineBanner online={false} testID="banner" />);
    const banner = screen.getByTestId("banner");
    expect(banner.props.accessibilityLiveRegion).toBe("polite");
    expect(screen.getByText(t("states.offline.title"))).toBeOnTheScreen();
  });

  it("renders nothing while online", async () => {
    await renderKit(<OfflineBanner online testID="banner" />);
    expect(screen.queryByTestId("banner")).toBeNull();
  });
});

describe("ProgressBar", () => {
  it("is a named progressbar with its value", async () => {
    await renderKit(<ProgressBar label="Uploading video" value={40} />);
    const bar = screen.getByRole("progressbar", { name: "Uploading video" });
    expect(bar).toHaveAccessibilityValue({ max: 100, min: 0, now: 40 });
  });

  it("has no value when indeterminate", async () => {
    await renderKit(<ProgressBar label="Uploading video" />);
    const bar = screen.getByRole("progressbar", { name: "Uploading video" });
    expect(bar.props.accessibilityValue).toEqual({ max: 100, min: 0 });
  });
});

describe("domain empty states", () => {
  // Each hand has one meaning: the open palm (2) nothing here yet, the hand
  // pointing across (1) finding; never a hand picked at random.
  it.each([
    ["favorites", FavoritesEmptyState, 2],
    ["lists", ListsEmptyState, 2],
    ["no results", NoResultsEmptyState, 1],
    ["search idle", SearchIdleEmptyState, 1],
  ] as const)("%s shows its hand", async (_name, State, hand) => {
    await renderKit(<State />);
    expect(drawnSvgs()).toEqual([handSvgs[hand]]);
  });
});
