import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderKit, t } from "../test/render";
import { ConsentBanner } from "./consent-banner";

const noop = (): void => undefined;

describe("ConsentBanner (native: a bottom sheet)", () => {
  it("shows the copy, the privacy link and two choices", async () => {
    const onAllow = jest.fn();
    const onDecline = jest.fn();
    const onOpenPrivacy = jest.fn();
    await renderKit(
      <ConsentBanner
        onAllow={onAllow}
        onDecline={onDecline}
        onDismiss={noop}
        onOpenPrivacy={onOpenPrivacy}
        open
      />
    );
    expect(
      screen.getByRole("header", { name: t("consent.title") })
    ).toBeOnTheScreen();
    expect(screen.getByText(t("consent.description"))).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("link", { name: t("consent.privacyLink") })
    );
    expect(onOpenPrivacy).toHaveBeenCalledTimes(1);
    await fireEvent.press(
      screen.getByRole("button", { name: t("consent.decline") })
    );
    expect(onDecline).toHaveBeenCalledTimes(1);
    await fireEvent.press(
      screen.getByRole("button", { name: t("consent.allow") })
    );
    expect(onAllow).toHaveBeenCalledTimes(1);
  });

  it("has no close button (the choice is the way out)", async () => {
    await renderKit(
      <ConsentBanner
        onAllow={noop}
        onDecline={noop}
        onDismiss={noop}
        onOpenPrivacy={noop}
        open
      />
    );
    expect(
      screen.queryByRole("button", { name: t("a11y.close") })
    ).not.toBeOnTheScreen();
  });

  it("busy disables both choices", async () => {
    await renderKit(
      <ConsentBanner
        busy
        onAllow={noop}
        onDecline={noop}
        onDismiss={noop}
        onOpenPrivacy={noop}
        open
      />
    );
    expect(
      screen.getByRole("button", { name: t("consent.allow") })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: t("consent.decline") })
    ).toBeDisabled();
  });

  it("renders nothing while closed", async () => {
    await renderKit(
      <ConsentBanner
        onAllow={noop}
        onDecline={noop}
        onDismiss={noop}
        onOpenPrivacy={noop}
        open={false}
      />
    );
    expect(screen.queryByText(t("consent.title"))).not.toBeOnTheScreen();
  });
});
