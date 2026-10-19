import { type CalculateMetadataFunction, Composition } from "remotion";
import { SponsoredVideo, type SponsoredVideoProps } from "../compositions";
import { RENDER_FPS, SPONSORED_VIDEO_ID } from "../contract";

/** Studio-free defaults; a render always passes the source's own props. */
const DEFAULT_PROPS: SponsoredVideoProps = {
  background: { kind: "image", src: "data:," },
  displayName: "SMOG & Co",
  durationInFrames: 5 * RENDER_FPS,
  height: 1920,
  logoUrl: null,
  width: 1080,
};

/**
 * The size and duration are the props' own: the caller read them from the
 * source with `readSourceMetadata` and validated the props with
 * `sponsoredVideoPropsSchema` (ruling 5).
 */
export const calculateMetadata: CalculateMetadataFunction<
  SponsoredVideoProps
> = ({ props }) => ({
  durationInFrames: props.durationInFrames,
  height: props.height,
  width: props.width,
});

/**
 * The Remotion root: the one composition. It has no `schema` prop (Studio
 * is not used; ruling 5).
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
