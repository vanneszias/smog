import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderKit, t } from "../test/render";
import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { OfflineBanner } from "./offline-banner";
import { ProgressBar } from "./progress-bar";
import { Skeleton } from "./skeleton";
import { Spinner } from "./spinner";

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
