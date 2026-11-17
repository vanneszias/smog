import { describe, expect, it, jest } from "@jest/globals";
import { createI18n, type Locale } from "@smog/i18n";
import { I18nextProvider } from "@smog/i18n/react";
import { act, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { KitProvider } from "../../../../../ui-native/src/components/kit-provider";
import { SponsorEndCard } from "../../../../../ui-native/src/domain/sponsor-end-card";
import { VideoPlayer } from "../../../../../ui-native/src/domain/video-player";
import { renderKit } from "../../../../support/ui-native/render";

interface MockPlayer {
  duration: number;
  emit: (event: string, payload?: unknown) => void;
}

const { mockVideoPlayers } = jest.requireMock<{
  mockVideoPlayers: MockPlayer[];
}>("expo-video");

function latest(): MockPlayer {
  const player = mockVideoPlayers.at(-1);
  if (!player) {
    throw new Error("No player was created");
  }
  return player;
}

async function tick(
  player: MockPlayer,
  currentTime: number,
  duration = 20
): Promise<void> {
  player.duration = duration;
  await act(() => {
    player.emit("timeUpdate", { currentTime });
  });
}

/** The card is hidden from the screen reader, so every query includes hidden elements. */
const HIDDEN = { includeHiddenElements: true } as const;

function inLocale(ui: ReactElement, locale: Locale): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={createI18n(locale)}>
      <KitProvider>{ui}</KitProvider>
    </I18nextProvider>
  );
}

describe("SponsorEndCard", () => {
  it("says the message in the viewer's language with the name as typed", async () => {
    await inLocale(<SponsorEndCard name="Bakkerij JAN nv" />, "fr");
    expect(
      screen.getByText("Rendu possible grâce à", HIDDEN)
    ).toBeOnTheScreen();
    expect(screen.getByText("Bakkerij JAN nv", HIDDEN)).toBeOnTheScreen();
  });

  it("speaks Dutch and English too", async () => {
    const nl = await inLocale(<SponsorEndCard name="Jan" />, "nl");
    expect(screen.getByText("Mogelijk gemaakt door", HIDDEN)).toBeOnTheScreen();
    await nl.unmount();
    await inLocale(<SponsorEndCard name="Jan" />, "en");
    expect(screen.getByText("Made possible by", HIDDEN)).toBeOnTheScreen();
  });

  it("shows the logo only when there is one, and is hidden from the screen reader", async () => {
    const { rerender } = await renderKit(
      <SponsorEndCard logoSrc="https://example.test/l.png" name="Jan" />
    );
    expect(
      screen.getByTestId("sponsor-end-card-logo", HIDDEN).props.source
    ).toEqual({
      uri: "https://example.test/l.png",
    });
    const card = screen.getByTestId("sponsor-end-card", HIDDEN);
    expect(card.props.accessibilityElementsHidden).toBe(true);
    expect(card.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(card.props.pointerEvents).toBe("none");
    await rerender(<SponsorEndCard name="Jan" />);
    expect(screen.queryByTestId("sponsor-end-card-logo", HIDDEN)).toBeNull();
  });
});

describe("SponsorEndCard look and motion", () => {
  it("is a deep green band at the bottom, the name in the surface's text", async () => {
    await renderKit(<SponsorEndCard name="Jan" />);
    expect(
      screen.getByTestId("sponsor-end-card-band", HIDDEN)
    ).toBeOnTheScreen();
    expect(screen.getByText("Jan", HIDDEN)).toBeOnTheScreen();
  });

  it("rises in and fades out, and does neither under reduced motion", async () => {
    await renderKit(<SponsorEndCard name="Jan" />);
    const card = screen.getByTestId("sponsor-end-card", HIDDEN);
    expect(card.props.entering).toBeDefined();
    expect(card.props.exiting).toBeDefined();
    jest.mocked(useReducedMotion).mockReturnValue(true);
    await renderKit(<SponsorEndCard name="Ann" />);
    const reduced = screen.getAllByTestId("sponsor-end-card", HIDDEN).at(-1);
    expect(reduced?.props.entering).toBeUndefined();
    expect(reduced?.props.exiting).toBeUndefined();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });
});

describe("VideoPlayer end card", () => {
  const endCard = { logoSrc: "https://example.test/l.png", name: "Jan" };
  const card = () => screen.queryByTestId("sponsor-end-card", HIDDEN);

  it("shows only in the last seconds, timed from the duration, and hides after a seek back", async () => {
    await renderKit(<VideoPlayer endCard={endCard} playbackId="pb-1" />);
    const player = latest();
    expect(card()).toBeNull();
    await tick(player, 10);
    expect(card()).toBeNull();
    await tick(player, 15.9);
    expect(card()).toBeNull();
    await tick(player, 16);
    expect(card()).not.toBeNull();
    await tick(player, 19.9);
    expect(card()).not.toBeNull();
    await tick(player, 0.2);
    expect(card()).toBeNull();
  });

  it("a short video shows it for its last half at most, and waits for a duration", async () => {
    await renderKit(<VideoPlayer endCard={endCard} playbackId="pb-1" />);
    const player = latest();
    await tick(player, 1, Number.NaN);
    expect(card()).toBeNull();
    await tick(player, 2.9, 6);
    expect(card()).toBeNull();
    await tick(player, 3, 6);
    expect(card()).not.toBeNull();
  });

  it("shows no card without an end card (no sponsor, or a rendered video)", async () => {
    await renderKit(<VideoPlayer playbackId="pb-1" />);
    await tick(latest(), 19);
    expect(card()).toBeNull();
  });
});
