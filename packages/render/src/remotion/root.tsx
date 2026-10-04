import { type CalculateMetadataFunction, Composition } from "remotion";
import { SponsoredVideo, type SponsoredVideoProps } from "../compositions";
import { RENDER_FPS, SPONSORED_VIDEO_ID } from "../contract";

/** Studio-free defaults; a render always passes the source's own props. */
const DEFAULT_PROPS: SponsoredVideoProps = {
  displayName: "SMOG & Co",
  durationInFrames: 5 * RENDER_FPS,
  height: 1920,
  width: 1080,
};

/** The size and duration are the props' own (read from the source). */
const calculateMetadata: CalculateMetadataFunction<SponsoredVideoProps> = ({
  props,
}) => ({
  durationInFrames: props.durationInFrames,
  height: props.height,
  width: props.width,
});

/**
 * The Remotion root: the one composition. Its size and duration are the
 * props' own (read from the source by the caller, ruling 5), so
 * `calculateMetadata` only hands them back.
 */
export function Root(): React.ReactNode {
  return (
    <Composition
      calculateMetadata={calculateMetadata}
      component={SponsoredVideo}
      defaultProps={DEFAULT_PROPS}
      durationInFrames={DEFAULT_PROPS.durationInFrames}
      fps={RENDER_FPS}
      height={DEFAULT_PROPS.height}
      id={SPONSORED_VIDEO_ID}
      width={DEFAULT_PROPS.width}
    />
  );
}
