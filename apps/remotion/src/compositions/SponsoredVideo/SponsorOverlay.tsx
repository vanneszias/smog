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
  config?: OverlayConfig;
  logoUrl?: string;
  sponsorName: string;
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
    config: { damping: 200 }, // Smooth, no bounce
    durationInFrames: fadeInFrames,
    fps,
    frame: frame - startFrame,
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

  const _textX = (config.text.x / 100) * width;
  const textY = (config.text.y / 100) * height;
  const fontSize = (config.text.fontSize / 100) * height;
  const lineHeight = fontSize * 1.2; // 20% larger than font size for spacing

  // Slide up animation combined with fade
  const translateY = interpolate(animationProgress, [0, 1], [30, 0]);

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        inset: 0,
        justifyContent: "flex-end",
        opacity: animationProgress,
        paddingBottom: height - textY - fontSize,
        position: "absolute",
        transform: `translateY(${translateY}px)`,
      }}
    >
      {/* Sponsor Logo */}
      {logoUrl ? (
        <Img
          src={logoUrl}
          style={{
            height: logoHeight,
            left: logoX - logoWidth / 2,
            objectFit: "contain",
            position: "absolute",
            top: logoY - logoHeight / 2,
            width: logoWidth,
          }}
        />
      ) : null}

      {/* Sponsor Text Line 1: Introduction */}
      <div
        style={{
          color: config.text.color,
          fontFamily: "system-ui, sans-serif",
          fontSize,
          fontWeight: 600,
          left: "50%",
          position: "absolute",
          top: textY,
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
        }}
      >
        Met de warme steun van:
      </div>

      {/* Sponsor Text Line 2: Sponsor Name */}
      <div
        style={{
          color: config.text.color,
          fontFamily: "system-ui, sans-serif",
          fontSize,
          fontWeight: 600,
          left: "50%",
          position: "absolute",
          top: textY + lineHeight + fontSize * 0.3,
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
        }}
      >
        {sponsorName}
      </div>
    </div>
  );
};
