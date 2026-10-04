import {
  Html5Video,
  Img,
  OffthreadVideo,
  useRemotionEnvironment,
} from "remotion";
import { useFailure } from "./failure";
import type { SponsoredVideoBackground } from "./props";

const COVER = { height: "100%", objectFit: "cover", width: "100%" } as const;

/** No URL in the message: a signed source must never reach a log. */
const IMAGE_FAILED = "the background image could not be loaded";
const VIDEO_FAILED = "the background video could not be played";

/**
 * The full-frame background, `cover`-fitted (phase 7 ruling 5). While
 * rendering, the source is an `OffthreadVideo`: frame accurate, and fetched
 * server side, so the render does not depend on Mux's CORS headers. In the
 * Player it is an `Html5Video`. The image is the Player's fallback only. In
 * the Player a load failure reaches the Player's `errorFallback`
 * (`useFailure`).
 */
export function Background({
  background,
}: {
  background: SponsoredVideoBackground;
}): React.ReactNode {
  const { isRendering } = useRemotionEnvironment();
  const failImage = useFailure(IMAGE_FAILED);
  const failVideo = useFailure(VIDEO_FAILED);
  if (background.kind === "image") {
    return <Img onError={failImage} src={background.src} style={COVER} />;
  }
  return isRendering ? (
    <OffthreadVideo src={background.src} style={COVER} />
  ) : (
    <Html5Video onError={failVideo} src={background.src} style={COVER} />
  );
}
