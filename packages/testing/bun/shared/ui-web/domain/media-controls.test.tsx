import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, fireEvent, screen } from "@testing-library/react";
import {
  AudioButton,
  NameOverlayToggle,
} from "../../../../../ui-web/src/domain/media-controls";
import { renderKit } from "../../../../support/ui-web/render";

/** A stand-in for `Audio`: records what was played and paused. */
class FakeAudio {
  static instances: FakeAudio[] = [];
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = true;
  preload = "";
  readonly src: string;
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
  pause(): void {
    this.paused = true;
  }
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
}

const original = globalThis.Audio;

beforeEach(() => {
  FakeAudio.instances = [];
  globalThis.Audio = FakeAudio as unknown as typeof Audio;
});

afterEach(() => {
  globalThis.Audio = original;
});

describe("AudioButton", () => {
  test("renders a labelled button and loads nothing until it is pressed (no autoplay)", () => {
    renderKit(<AudioButton src="/api/audio/g/fr/u" />, "fr");
    expect(
      screen.getByRole("button", { name: "Écouter la prononciation" })
    ).toBeDefined();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  test("plays on a press and stops on the next", async () => {
    renderKit(<AudioButton src="/api/audio/g/en/u" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Listen to the pronunciation" })
    );
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0]?.src).toBe("/api/audio/g/en/u");
    expect(FakeAudio.instances[0]?.paused).toBe(false);
    const stop = await screen.findByRole("button", {
      name: "Stop the pronunciation",
    });
    fireEvent.click(stop);
    expect(FakeAudio.instances[0]?.paused).toBe(true);
    expect(
      screen.getByRole("button", { name: "Listen to the pronunciation" })
    ).toBeDefined();
  });

  test("goes back to idle when the clip ends", async () => {
    renderKit(<AudioButton src="/api/audio/g/en/u" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Listen to the pronunciation" })
    );
    await screen.findByRole("button", { name: "Stop the pronunciation" });
    act(() => {
      FakeAudio.instances[0]?.onended?.();
    });
    expect(
      screen.getByRole("button", { name: "Listen to the pronunciation" })
    ).toBeDefined();
  });

  test("plays one clip at a time: a second button stops the first", async () => {
    renderKit(
      <>
        <AudioButton aria-label="one" src="/api/audio/g/en/one" />
        <AudioButton aria-label="two" src="/api/audio/g/en/two" />
      </>
    );
    fireEvent.click(screen.getByRole("button", { name: "one" }));
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "two" }));
    await act(async () => {
      await Promise.resolve();
    });
    const [first, second] = FakeAudio.instances;
    expect(first?.paused).toBe(true);
    expect(second?.paused).toBe(false);
  });

  test("a clip that fails to load leaves the button idle", () => {
    const error = mock();
    const logged = console.error;
    console.error = error;
    renderKit(<AudioButton src="/api/audio/g/en/u" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Listen to the pronunciation" })
    );
    act(() => {
      FakeAudio.instances[0]?.onerror?.();
    });
    console.error = logged;
    expect(error).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Listen to the pronunciation" })
    ).toBeDefined();
  });
});

describe("NameOverlayToggle", () => {
  test("is a labelled switch that reports the new state", () => {
    const onChange = mock();
    renderKit(<NameOverlayToggle checked onCheckedChange={onChange} />);
    const toggle = screen.getByRole("switch", {
      name: "Show the name on the video",
    });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
