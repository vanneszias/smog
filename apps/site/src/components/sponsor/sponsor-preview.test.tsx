/**
 * The wizard's Remotion Player preview (phase 7 task 8, ruling 8), with the
 * Player, the metadata reader and the font loader faked at their boundary
 * (`@/test/sponsor-preview-fakes`): the props the Player gets, the image
 * fallback, the kit controls and the server render.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Locale } from "@smog/config/constants";
import { createI18n } from "@smog/i18n";
import { I18nextProvider } from "@smog/i18n/react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import {
  emitPlayer,
  font,
  player,
  reads,
  resetPreviewFakes,
  sources,
} from "@/test/sponsor-preview-fakes";

const { SponsoredVideo } = await import("@smog/render/composition");
const { SponsorPreview } = await import("./sponsor-preview");
const { SponsorPreviewSlot } = await import("./preview-slot");
const { forgetSources } = await import("./use-source-metadata");
const { renderToString } = await import("react-dom/server");

const HIGHEST = "https://stream.mux.com/pb-1/highest.mp4";
const HIGH = "https://stream.mux.com/pb-1/high.mp4";
const THUMBNAIL = "https://image.mux.com/pb-1/thumbnail.webp?width=720";
const META = {
  durationInFrames: 60,
  durationInSeconds: 2,
  height: 640,
  width: 360,
};
const BLOB_URL = /^blob:/;
const FALLBACK_NOTE =
  "The video cannot be played here, so the preview shows a still of the gesture. The final video uses the full clip, with this ending.";
/** A static import of the Player's stack (the lazy import is `import(…)`). */
const HEAVY_IMPORT =
  /from "(?:remotion|@remotion\/[^"]+|mediabunny|@smog\/render\/(?:composition|metadata)|\.\/use-source-metadata|\.\/sponsor-preview)"/;

interface PreviewProps {
  displayName?: string;
  locale?: Locale;
  logo?: Blob | null;
}

function Preview({
  displayName = "Bakkerij Jansen",
  locale = "en",
  logo = null,
}: PreviewProps): ReactNode {
  return (
    <I18nextProvider i18n={createI18n(locale)}>
      <SponsorPreview
        displayName={displayName}
        logo={logo}
        name="Broer"
        playbackId="pb-1"
      />
    </I18nextProvider>
  );
}

async function mounted(): Promise<NonNullable<typeof player.props>> {
  await screen.findByTestId("remotion-player");
  const { props } = player;
  if (!props) {
    throw new Error("the Player did not render");
  }
  return props;
}

function button(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

describe("SponsorPreview (phase 7 ruling 8)", () => {
  beforeEach(() => {
    resetPreviewFakes();
    forgetSources();
  });

  test("the Player mounts once the font and the metadata are in, with the composition's props", async () => {
    font.hold = true;
    sources.set(HIGHEST, META);
    const logo = new Blob([new Uint8Array([1])], { type: "image/png" });
    render(<Preview logo={logo} />);
    // The poster in the same box until then, and the controls wait.
    expect(screen.getByText("Loading the preview…")).toBeDefined();
    expect(
      screen.getByRole("img", { name: "Preview for Broer" })
    ).toBeDefined();
    expect(button("Play").hasAttribute("disabled")).toBe(true);
    expect(font.loads).toBe(1);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId("remotion-player")).toBeNull();
    act(() => font.release());
    const props = await mounted();
    expect(props.component).toBe(SponsoredVideo);
    expect(props.inputProps).toEqual({
      background: { kind: "video", src: HIGHEST },
      displayName: "Bakkerij Jansen",
      durationInFrames: 60,
      height: 640,
      logoUrl: expect.stringMatching(BLOB_URL),
      width: 360,
    });
    expect(props).toMatchObject({
      acknowledgeRemotionLicense: true,
      clickToPlay: false,
      compositionHeight: 640,
      compositionWidth: 360,
      controls: false,
      durationInFrames: 60,
      fps: 30,
      // Paused on the last frame: the result at once, nothing autoplays.
      initialFrame: 59,
      initiallyMuted: true,
      loop: false,
      moveToBeginningWhenEnded: false,
      // No silent `data:` audio (the CSP's `media-src` refuses it).
      numberOfSharedAudioTags: 0,
    });
    expect(props.autoPlay).not.toBe(true);
    expect(screen.queryByText("Loading the preview…")).toBeNull();
    expect(button("Play").hasAttribute("disabled")).toBe(false);
    expect(reads).toEqual([HIGHEST]);
  });

  test("high.mp4 when highest.mp4 does not read", async () => {
    sources.set(HIGH, META);
    render(<Preview />);
    const props = await mounted();
    expect(props.inputProps.background).toEqual({ kind: "video", src: HIGH });
    expect(reads).toEqual([HIGHEST, HIGH]);
  });

  test("neither MP4: the same composition over the poster image for 6 s, with a note", async () => {
    render(<Preview />);
    const props = await mounted();
    expect(props.inputProps).toMatchObject({
      background: { kind: "image", src: THUMBNAIL },
      durationInFrames: 180,
      height: 960,
      width: 720,
    });
    expect(props).toMatchObject({
      compositionHeight: 960,
      compositionWidth: 720,
      durationInFrames: 180,
      initialFrame: 179,
    });
    expect(
      screen.getByText(
        "The video cannot be played here, so the preview shows a still of the gesture. The final video uses the full clip, with this ending."
      )
    ).toBeDefined();
  });

  test("a video that fails to play falls back to the image", async () => {
    sources.set(HIGHEST, META);
    player.failing.add(HIGHEST);
    render(<Preview />);
    await screen.findByText(
      "The video cannot be played here, so the preview shows a still of the gesture. The final video uses the full clip, with this ending."
    );
    const props = await mounted();
    expect(props.inputProps.background).toEqual({
      kind: "image",
      src: THUMBNAIL,
    });
  });

  test("when the image fails too, the poster and the note stay, without controls", async () => {
    player.failing.add(THUMBNAIL);
    render(<Preview />);
    await screen.findByText(
      "The video cannot be played here, so the preview shows a still of the gesture. The final video uses the full clip, with this ending."
    );
    expect(screen.queryByTestId("remotion-player")).toBeNull();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
    const box = screen.getByRole("img", { name: "Preview for Broer" });
    expect(box.querySelector("img")?.getAttribute("src")).toContain(
      "https://image.mux.com/pb-1/thumbnail.webp"
    );
  });

  test("a font that does not load: the poster and its own note, never the video note (review M-1)", async () => {
    font.fails = true;
    sources.set(HIGHEST, META);
    render(<Preview />);
    await screen.findByText(
      "The preview cannot be shown right now. The final video is made with your name and logo as entered."
    );
    expect(screen.queryByTestId("remotion-player")).toBeNull();
    expect(screen.queryByText(FALLBACK_NOTE)).toBeNull();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });

  test("a loaded font and a known source: no loading state on the next preview (review M-2)", async () => {
    sources.set(HIGHEST, META);
    const first = render(<Preview />);
    await mounted();
    first.unmount();
    render(<Preview />);
    // At once: the Player, no "Loading" announcement, no new font load.
    expect(screen.getByTestId("remotion-player")).toBeDefined();
    expect(screen.queryByText("Loading the preview…")).toBeNull();
    expect(font.loads).toBe(1);
  });

  test("a video failing while Play has the focus: the button keeps it (review M-3)", async () => {
    sources.set(HIGHEST, META);
    const { rerender } = render(<Preview />);
    await mounted();
    act(() => button("Play").focus());
    player.failing.add(HIGHEST);
    rerender(<Preview displayName="Bakkerij Jansen " />);
    await screen.findByText(FALLBACK_NOTE);
    expect(player.props?.inputProps.background).toEqual({
      kind: "image",
      src: THUMBNAIL,
    });
    expect(document.activeElement).toBe(button("Play"));
    expect(button("Play").hasAttribute("disabled")).toBe(false);
  });

  test("when every fallback fails, the focus moves from the controls to the note", async () => {
    sources.set(HIGHEST, META);
    const { rerender } = render(<Preview />);
    await mounted();
    act(() => button("Show the ending").focus());
    player.failing.add(HIGHEST);
    player.failing.add(THUMBNAIL);
    rerender(<Preview displayName="Bakkerij Jansen " />);
    const note = await screen.findByText(FALLBACK_NOTE);
    await waitFor(() => expect(document.activeElement).toBe(note));
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });

  test("Play replays from the start, Pause pauses, the label follows the Player", async () => {
    sources.set(HIGHEST, META);
    render(<Preview />);
    await mounted();
    player.frame = 59;
    fireEvent.click(button("Play"));
    expect(player.calls).toEqual(["seekTo:0", "play"]);
    act(() => emitPlayer("play"));
    fireEvent.click(button("Pause"));
    expect(player.calls).toEqual(["seekTo:0", "play", "pause"]);
    act(() => emitPlayer("pause"));
    // Mid-way, Play resumes where it is.
    player.frame = 20;
    fireEvent.click(button("Play"));
    expect(player.calls.at(-1)).toBe("play");
    expect(player.calls).toHaveLength(4);
    act(() => emitPlayer("play"));
    act(() => emitPlayer("ended"));
    expect(button("Play")).toBeDefined();
  });

  test("Show the ending plays from the overlay's start", async () => {
    sources.set(HIGHEST, { ...META, durationInFrames: 300 });
    render(<Preview />);
    await mounted();
    fireEvent.click(button("Show the ending"));
    // 300 frames − 5 s × 30 fps.
    expect(player.calls).toEqual(["seekTo:150", "play"]);
  });

  test("a clip shorter than the overlay: Show the ending starts at frame 0", async () => {
    sources.set(HIGHEST, META);
    render(<Preview />);
    await mounted();
    fireEvent.click(button("Show the ending"));
    expect(player.calls).toEqual(["seekTo:0", "play"]);
  });

  for (const [locale, play, pause, ending, label] of [
    ["en", "Play", "Pause", "Show the ending", "Preview for Broer"],
    ["nl", "Afspelen", "Pauzeren", "Toon het einde", "Voorbeeld voor Broer"],
    ["fr", "Lire", "Pause", "Voir la fin", "Aperçu pour Broer"],
  ] as const) {
    test(`the controls and the frame are named in ${locale}`, async () => {
      sources.set(HIGHEST, META);
      render(<Preview locale={locale} />);
      await mounted();
      expect(screen.getByRole("img", { name: label })).toBeDefined();
      expect(button(ending)).toBeDefined();
      fireEvent.click(button(play));
      act(() => emitPlayer("play"));
      expect(button(pause)).toBeDefined();
    });
  }

  test("a new name or logo updates the props without remounting the Player", async () => {
    sources.set(HIGHEST, META);
    const { rerender } = render(<Preview />);
    await mounted();
    expect(player.mounts).toBe(1);
    rerender(<Preview displayName="Nieuwe Naam" />);
    expect(player.props?.inputProps).toMatchObject({
      displayName: "Nieuwe Naam",
      logoUrl: null,
    });
    const logo = new Blob([new Uint8Array([1])], { type: "image/png" });
    rerender(<Preview displayName="Nieuwe Naam" logo={logo} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(player.props?.inputProps).toMatchObject({
      logoUrl: expect.stringMatching(BLOB_URL),
    });
    // An invalid name (empty, too long) keeps the last valid one.
    rerender(<Preview displayName="" logo={logo} />);
    expect(player.props?.inputProps).toMatchObject({
      displayName: "Nieuwe Naam",
    });
    rerender(<Preview displayName={"x".repeat(36)} logo={logo} />);
    expect(player.props?.inputProps).toMatchObject({
      displayName: "Nieuwe Naam",
    });
    expect(player.mounts).toBe(1);
  });
});

describe("SponsorPreviewSlot (phase 7 ruling 8, I-6)", () => {
  beforeEach(() => {
    resetPreviewFakes();
    forgetSources();
  });

  test("the server render is the poster in the same box, without the Player", () => {
    const html = renderToString(
      <I18nextProvider i18n={createI18n("en")}>
        <SponsorPreviewSlot
          displayName="Bakkerij Jansen"
          logo={null}
          name="Broer"
          playbackId="pb-1"
        />
      </I18nextProvider>
    );
    expect(html).toContain('aria-label="Preview for Broer"');
    expect(html).toContain("aspect-3/4");
    expect(html).toContain("https://image.mux.com/pb-1/thumbnail.webp");
    expect(html).not.toContain("remotion-player");
    expect(player.props).toBeNull();
    expect(font.loads).toBe(0);
    expect(reads).toEqual([]);
  });

  test("the SSR branch: with import.meta.env.SSR true the build drops the lazy import", async () => {
    // `bun test` leaves `import.meta.env.SSR` undefined, so the render tests
    // above take the client branch; Vite defines it per environment. The
    // same define in a bundle shows the server build has no path to the
    // Player module (the deploy guard checks the real `dist/server`).
    const bundle = async (ssr: boolean): Promise<string> => {
      const result = await Bun.build({
        define: { "import.meta.env.SSR": JSON.stringify(ssr) },
        entrypoints: [join(import.meta.dirname, "preview-slot.tsx")],
        minify: { syntax: true },
        packages: "external",
        splitting: true,
        target: "browser",
      });
      expect(result.success).toBe(true);
      const outputs = await Promise.all(
        result.outputs.map((output) => output.text())
      );
      return outputs.join("\n");
    };
    const server = await bundle(true);
    expect(server).toContain("LazySponsorPreview = null");
    expect(server).not.toContain("sponsor-preview");
    expect(server).not.toContain("@remotion/player");
    expect(server).not.toContain("mediabunny");
    const client = await bundle(false);
    expect(client).toContain("@remotion/player");
  });

  test("on the client the lazy Player replaces the poster", async () => {
    sources.set(HIGHEST, META);
    render(
      <I18nextProvider i18n={createI18n("en")}>
        <SponsorPreviewSlot
          displayName="Bakkerij Jansen"
          logo={null}
          name="Broer"
          playbackId="pb-1"
        />
      </I18nextProvider>
    );
    const props = await mounted();
    expect(props.inputProps.background).toEqual({
      kind: "video",
      src: HIGHEST,
    });
  });

  test("Remotion and mediabunny are reached only through the lazy module", () => {
    const dir = import.meta.dirname;
    const files = readdirSync(dir).filter(
      (file) => file.endsWith(".tsx") || file.endsWith(".ts")
    );
    const importers = files.filter(
      (file) =>
        !file.includes(".test.") &&
        HEAVY_IMPORT.test(readFileSync(join(dir, file), "utf8"))
    );
    expect(importers.sort()).toEqual([
      "sponsor-preview.tsx",
      "use-source-metadata.ts",
    ]);
    const slot = readFileSync(join(dir, "preview-slot.tsx"), "utf8");
    expect(slot).toContain("import.meta.env.SSR");
    expect(slot).toContain('import("./sponsor-preview")');
  });
});
