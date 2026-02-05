import type { CalculateMetadataFunction } from "remotion";
import { Composition } from "remotion";
import { SponsoredVideo } from "./compositions/SponsoredVideo";
import {
  DEFAULT_OVERLAY_CONFIG,
  type SponsoredVideoProps,
  SponsoredVideoSchema,
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "./types/schema";
import { getMediaMetadata } from "./utils/get-media-metadata";

// Sample video for preview in Remotion Studio
const SAMPLE_VIDEO_URL =
  "https://stream.mux.com/VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU/high.mp4";

const calculateMetadata: CalculateMetadataFunction<
  SponsoredVideoProps
> = async ({ props }) => {
  // Fetch the video duration to set the composition duration
  const { durationInSeconds, dimensions } = await getMediaMetadata(
    props.videoSrc
  );

  return {
    durationInFrames: Math.ceil(durationInSeconds * VIDEO_FPS),
    // Optionally match the video dimensions, but we default to 9:16
    width: dimensions?.width ?? VIDEO_WIDTH,
    height: dimensions?.height ?? VIDEO_HEIGHT,
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      calculateMetadata={calculateMetadata}
      component={SponsoredVideo}
      defaultProps={{
        videoSrc: SAMPLE_VIDEO_URL,
        sponsorName: "SMOG",
        logoUrl: undefined,
        overlayConfig: DEFAULT_OVERLAY_CONFIG,
      }} // Placeholder, overridden by calculateMetadata
      durationInFrames={300}
      fps={VIDEO_FPS}
      height={VIDEO_HEIGHT}
      id="SponsoredVideo"
      schema={SponsoredVideoSchema}
      width={VIDEO_WIDTH}
    />
  );
};
