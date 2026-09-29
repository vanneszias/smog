import { ALL_FORMATS, Input, UrlSource } from "mediabunny";

export interface MediaMetadata {
  dimensions: {
    width: number;
    height: number;
  } | null;
  durationInSeconds: number;
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
          height: videoTrack.displayHeight,
          width: videoTrack.displayWidth,
        }
      : null;

    return {
      dimensions,
      durationInSeconds,
    };
  } finally {
    input.dispose();
  }
};
