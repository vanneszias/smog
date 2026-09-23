import { Video } from "@remotion/media";
import { AbsoluteFill } from "remotion";
import type { SponsoredVideoProps } from "../../types/schema";
import { DEFAULT_OVERLAY_CONFIG } from "../../types/schema";
import { SponsorOverlay } from "./SponsorOverlay";

export const SponsoredVideo: React.FC<SponsoredVideoProps> = ({
  videoSrc,
  logoUrl,
  sponsorName,
  overlayConfig,
}) => {
  const config = overlayConfig ?? DEFAULT_OVERLAY_CONFIG;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* Background video - fills the entire composition */}
      <Video
        src={videoSrc}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* Sponsor overlay - logo and text */}
      <SponsorOverlay
        config={config}
        logoUrl={logoUrl}
        sponsorName={sponsorName}
      />
    </AbsoluteFill>
  );
};
