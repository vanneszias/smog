import { ALL_FORMATS, Input, UrlSource } from "mediabunny";

export interface MediaMetadata {
  durationInSeconds: number;
  dimensions: {
    width: number;
    height: number;
  } | null;
}

export const getMediaMetadata = async (src: string): Promise<MediaMetadata> => {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new UrlSource(src, {
      getRetryDelay: () => null,
    }),
  });

  try {
    const durationInSeconds = await input.computeDuration();

    // Get video track for dimensions
    const videoTrack = await input.getPrimaryVideoTrack();
    const dimensions = videoTrack
      ? {
          width: videoTrack.displayWidth,
          height: videoTrack.displayHeight,
        }
      : null;

    return {
      durationInSeconds,
      dimensions,
    };
  } finally {
    input.dispose();
  }
};
