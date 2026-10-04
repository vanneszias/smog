/**
 * The wizard preview's boundaries, faked for happy-dom (phase 7 task 8):
 * `@remotion/player`'s `Player` (it needs a real browser to play), the
 * source metadata reader (`@smog/render/metadata/mp4`, which would fetch
 * Mux), the poster's size (`readPosterSize`, which would load it)
 * and the overlay font loader (`@smog/render/composition`, happy-dom loads
 * no font). Import this module before the components: `mock.module` is
 * process wide in `bun test`, so every test file that renders the preview
 * imports it, and they all see the same fakes. `resetPreviewFakes()` in a
 * `beforeEach` starts each test clean.
 */
import { mock } from "bun:test";
import type { SourceMetadata } from "@smog/render/metadata/mp4";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
} from "react";
import type { PosterSize } from "../components/sponsor/poster-size";

type Listener = (event: { detail: unknown }) => void;

interface FakePlayerProps {
  errorFallback?: (info: { error: Error }) => ReactNode;
  inputProps: {
    background: { kind: string; src: string };
    [key: string]: unknown;
  };
  ref?: Ref<unknown>;
  [key: string]: unknown;
}

/** What the fake Player saw, and what it was asked to do. */
export const player = {
  /** Its method calls, in order: `play`, `pause`, `seekTo:<frame>`. */
  calls: [] as string[],
  /** Background sources whose playback fails (the Player's `errorFallback`). */
  failing: new Set<string>(),
  /** The frame `getCurrentFrame()` answers. */
  frame: 0,
  listeners: new Map<string, Set<Listener>>(),
  /** How many times a Player mounted. */
  mounts: 0,
  /** The props of the last render, or `null` when none rendered. */
  props: null as FakePlayerProps | null,
};

/** Sends a Player event (`play`, `pause`, `ended`) to the listeners. */
export function emitPlayer(name: string): void {
  for (const listener of player.listeners.get(name) ?? []) {
    listener({ detail: undefined });
  }
}

function FakePlayer(props: FakePlayerProps): ReactNode {
  useEffect(() => {
    player.mounts += 1;
  }, []);
  player.props = props;
  useImperativeHandle(
    props.ref,
    () => ({
      addEventListener: (name: string, listener: Listener) => {
        const set = player.listeners.get(name) ?? new Set();
        set.add(listener);
        player.listeners.set(name, set);
      },
      getCurrentFrame: () => player.frame,
      isPlaying: () => false,
      pause: () => {
        player.calls.push("pause");
      },
      play: () => {
        player.calls.push("play");
      },
      removeEventListener: (name: string, listener: Listener) => {
        player.listeners.get(name)?.delete(listener);
      },
      seekTo: (frame: number) => {
        player.calls.push(`seekTo:${frame}`);
      },
    }),
    []
  );
  if (player.failing.has(props.inputProps.background.src)) {
    return (
      props.errorFallback?.({ error: new Error("playback failed") }) ?? null
    );
  }
  return (
    <div
      data-background={props.inputProps.background.src}
      data-testid="remotion-player"
    />
  );
}

/** The metadata answer per URL: the metadata, or the error it throws. */
export const sources = new Map<string, SourceMetadata | Error>();
/** Every URL `readMp4Metadata` was asked to read, in order. */
export const reads: string[] = [];

/**
 * The poster size per URL (the image fallback's composition size), or the
 * error the read throws, or `"hang"` (it never answers); a URL not set
 * answers 720 × 960 (3:4).
 */
export const posters = new Map<string, PosterSize | Error | "hang">();

export const font: {
  fails: boolean;
  hold: boolean;
  loaded: boolean;
  loads: number;
  release: () => void;
  texts: (string | undefined)[];
} = {
  /** When set, a load rejects. */
  fails: false,
  /** When set, a load waits for `release()`. */
  hold: false,
  /** What `isOverlayFontLoaded()` answers (a load that resolved sets it). */
  loaded: false,
  /** How many times `loadOverlayFont` ran. */
  loads: 0,
  /** Resolves the pending load (by default it resolves at once). */
  release: (): void => undefined,
  /** The text each load was for (`undefined`: every subset). */
  texts: [],
};

export function resetPreviewFakes(): void {
  player.calls = [];
  player.failing.clear();
  player.frame = 0;
  player.listeners.clear();
  player.mounts = 0;
  player.props = null;
  sources.clear();
  reads.length = 0;
  posters.clear();
  font.texts = [];
  font.fails = false;
  font.loaded = false;
  font.loads = 0;
  font.hold = false;
  font.release = () => undefined;
}

const composition = await import("@smog/render/composition");
const metadata = await import("@smog/render/metadata/mp4");

mock.module("@remotion/player", () => ({ Player: FakePlayer }));

mock.module("@smog/render/metadata/mp4", () => ({
  ...metadata,
  readMp4Metadata: (url: string): Promise<SourceMetadata> => {
    reads.push(url);
    const answer = sources.get(url) ?? new Error("not found");
    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer);
  },
}));

mock.module("@smog/render/composition", () => ({
  ...composition,
  isOverlayFontLoaded: (): boolean => font.loaded,
  loadOverlayFont: (text?: string): Promise<void> => {
    font.loads += 1;
    font.texts.push(text);
    if (font.fails) {
      return Promise.reject(new Error("font failed"));
    }
    const done = (): void => {
      font.loaded = true;
    };
    if (!font.hold) {
      done();
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      font.release = () => {
        done();
        resolve();
      };
    });
  },
}));

mock.module("../components/sponsor/poster-size", () => ({
  readPosterSize: (src: string): Promise<PosterSize> => {
    const answer = posters.get(src) ?? { height: 960, width: 720 };
    if (answer === "hang") {
      return new Promise(() => undefined);
    }
    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer);
  },
}));
