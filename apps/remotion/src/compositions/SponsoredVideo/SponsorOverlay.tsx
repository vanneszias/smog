import {
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { OverlayConfig } from "../../types/schema";
import { DEFAULT_OVERLAY_CONFIG } from "../../types/schema";

interface SponsorOverlayProps {
  logoUrl?: string;
  sponsorName: string;
  config?: OverlayConfig;
}

export const SponsorOverlay: React.FC<SponsorOverlayProps> = ({
  logoUrl,
  sponsorName,
  config = DEFAULT_OVERLAY_CONFIG,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  // Calculate when the overlay should start (from end of video)
  const startFrame = durationInFrames - config.animation.startTime * fps;
  const fadeInFrames = config.animation.fadeInDuration * fps;

  // Calculate opacity with spring animation for smooth fade-in
  const animationProgress = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 200 }, // Smooth, no bounce
    durationInFrames: fadeInFrames,
  });

  // Don't render if we haven't reached the start frame
  if (frame < startFrame) {
    return null;
  }

  // Calculate positions in pixels from percentages
  const logoX = (config.image.x / 100) * width;
  const logoY = (config.image.y / 100) * height;
  const logoWidth = (config.image.width / 100) * width;
  const logoHeight = (config.image.height / 100) * height;

  const textX = (config.text.x / 100) * width;
  const textY = (config.text.y / 100) * height;
  const fontSize = (config.text.fontSize / 100) * height;
  const lineHeight = fontSize * 1.2; // 20% larger than font size for spacing

  // Slide up animation combined with fade
  const translateY = interpolate(animationProgress, [0, 1], [30, 0]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: height - textY - fontSize,
        opacity: animationProgress,
        transform: `translateY(${translateY}px)`,
      }}
    >
      {/* Sponsor Logo */}
      {logoUrl && (
        <Img
          src={logoUrl}
          style={{
            position: "absolute",
            left: logoX - logoWidth / 2,
            top: logoY - logoHeight / 2,
            width: logoWidth,
            height: logoHeight,
            objectFit: "contain",
          }}
        />
      )}

      {/* Sponsor Text Line 1: Introduction */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: textY,
          transform: "translateX(-50%)",
          fontSize,
          color: config.text.color,
          fontWeight: 600,
          fontFamily: "system-ui, sans-serif",
          whiteSpace: "nowrap",
        }}
      >
        Met de warme steun van:
      </div>

      {/* Sponsor Text Line 2: Sponsor Name */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: textY + lineHeight + fontSize * 0.3,
          transform: "translateX(-50%)",
          fontSize,
          color: config.text.color,
          fontWeight: 600,
          fontFamily: "system-ui, sans-serif",
          whiteSpace: "nowrap",
        }}
      >
        {sponsorName}
      </div>
    </div>
  );
};
