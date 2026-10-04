/**
 * The wizard preview's boundaries, faked for happy-dom (phase 7 task 8):
 * `@remotion/player`'s `Player` (it needs a real browser to play), the
 * source metadata reader (`@smog/render/metadata`, which would fetch Mux)
 * and the overlay font loader (`@smog/render/composition`, happy-dom loads
 * no font). Import this module before the components: `mock.module` is
 * process wide in `bun test`, so every test file that renders the preview
 * imports it, and they all see the same fakes. `resetPreviewFakes()` in a
 * `beforeEach` starts each test clean.
 */
import { mock } from "bun:test";
import type { SourceMetadata } from "@smog/render/metadata";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
} from "react";

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
/** Every URL `readSourceMetadata` was asked to read, in order. */
export const reads: string[] = [];

export const font: {
  fails: boolean;
  hold: boolean;
  loaded: boolean;
  loads: number;
  release: () => void;
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
  font.fails = false;
  font.loaded = false;
  font.loads = 0;
  font.hold = false;
  font.release = () => undefined;
}

const composition = await import("@smog/render/composition");
const metadata = await import("@smog/render/metadata");

mock.module("@remotion/player", () => ({ Player: FakePlayer }));

mock.module("@smog/render/metadata", () => ({
  ...metadata,
  readSourceMetadata: (url: string): Promise<SourceMetadata> => {
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
  loadOverlayFont: (): Promise<void> => {
    font.loads += 1;
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
