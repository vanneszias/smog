import {
  Html5Video,
  Img,
  OffthreadVideo,
  useRemotionEnvironment,
} from "remotion";
import type { SponsoredVideoBackground } from "./props";

const COVER = { height: "100%", objectFit: "cover", width: "100%" } as const;

/**
 * The full-frame background, `cover`-fitted (phase 7 ruling 5). While
 * rendering, the source is an `OffthreadVideo`: frame accurate, and fetched
 * server side, so the render does not depend on Mux's CORS headers. In the
 * Player it is an `Html5Video`. The image is the Player's fallback only.
 */
export function Background({
  background,
}: {
  background: SponsoredVideoBackground;
}): React.ReactNode {
  const { isRendering } = useRemotionEnvironment();
  if (background.kind === "image") {
    return <Img src={background.src} style={COVER} />;
  }
  return isRendering ? (
    <OffthreadVideo src={background.src} style={COVER} />
  ) : (
    <Html5Video src={background.src} style={COVER} />
  );
}
