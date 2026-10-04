/**
 * The test card of `bun -F @smog/render fixture` (phase 7 ruling 15): a
 * coloured background and a frame counter, no source video. It is a
 * Remotion entry of its own, bundled only by `fixture.ts`; the sponsored
 * video's bundle never contains it.
 */
import {
  AbsoluteFill,
  Composition,
  interpolate,
  registerRoot,
  useCurrentFrame,
} from "remotion";

// `fixture.ts` selects it by this id (it never imports this file).
const FIXTURE_CARD_ID = "FixtureCard";
const FPS = 30;
const SECONDS = 2;

function FixtureCard(): React.ReactNode {
  const frame = useCurrentFrame();
  const hue = interpolate(frame, [0, FPS * SECONDS], [200, 320]);
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        backgroundColor: `hsl(${hue}, 45%, 45%)`,
        color: "white",
        fontFamily: "sans-serif",
        fontSize: 120,
        fontWeight: 700,
        justifyContent: "center",
      }}
    >
      {frame}
    </AbsoluteFill>
  );
}

function FixtureRoot(): React.ReactNode {
  return (
    <Composition
      component={FixtureCard}
      durationInFrames={FPS * SECONDS}
      fps={FPS}
      height={640}
      id={FIXTURE_CARD_ID}
      width={360}
    />
  );
}

registerRoot(FixtureRoot);
