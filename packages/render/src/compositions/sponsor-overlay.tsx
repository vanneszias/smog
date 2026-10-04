import { measureText } from "@remotion/layout-utils";
import { useEffect, useMemo, useState } from "react";
import { Img, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { RENDER_OVERLAY_LAYOUT } from "../contract";
import { useFailure } from "./failure";
import { overlayFontSize, type TextMeasure } from "./fit";
import {
  isOverlayFontLoaded,
  loadOverlayFont,
  OVERLAY_FONT_STACK,
  OVERLAY_FONT_WEIGHT,
} from "./font";
import {
  OVERLAY_LINE_HEIGHT,
  overlayGeometry,
  overlayTiming,
} from "./geometry";

const FONT_FAILED = "the overlay font could not be loaded";
const LOGO_FAILED = "the logo could not be loaded";

/**
 * Measures in the overlay font; only called once it has loaded. Only the
 * fixed Latin intro proves the font loaded (`validateFontIsLoaded`): a name
 * in a script Inter lacks is drawn, and measured, in the fallback font, and
 * validating it would throw (task 3 review, I-1).
 */
const measureOverlayText: TextMeasure = (text, fontSize, line) =>
  measureText({
    fontFamily: OVERLAY_FONT_STACK,
    fontSize,
    fontWeight: OVERLAY_FONT_WEIGHT,
    text,
    validateFontIsLoaded: line === "intro",
  }).width;

/**
 * Whether the overlay font has loaded (ruling 6). Until then the frame is
 * held with `delayRender`; the handle is continued in the cleanup after the
 * commit that shows the text, or when the overlay unmounts. A failure
 * cancels a render, and in the Player reaches its `errorFallback`.
 */
function useOverlayFont(): boolean {
  const { continueRender, delayRender } = useDelayRender();
  const fail = useFailure(FONT_FAILED);
  const [ready, setReady] = useState(isOverlayFontLoaded);
  useEffect(() => {
    if (ready) {
      return;
    }
    let active = true;
    const handle = delayRender("Loading the overlay font");
    loadOverlayFont().then(
      () => {
        if (active) {
          setReady(true);
        }
      },
      (error: unknown) => {
        if (active) {
          fail(error);
        }
      }
    );
    return () => {
      active = false;
      continueRender(handle);
    };
  }, [continueRender, delayRender, fail, ready]);
  return ready;
}

/**
 * The old `SponsorOverlay` (phase 7 ruling 5): in the last
 * `overlaySeconds`, the logo and the two lines fade in with a damped spring
 * and slide up together. Documented changes: the bundled font with a Noto
 * fallback, a size that fits the width, and a pinned line height of 1.2.
 */
export function SponsorOverlay({
  displayName,
  logoUrl,
}: {
  displayName: string;
  logoUrl: string | null;
}): React.ReactNode {
  const frame = useCurrentFrame();
  const { durationInFrames, fps, height, width } = useVideoConfig();
  const fontReady = useOverlayFont();
  const failLogo = useFailure(LOGO_FAILED);
  const { intro, color } = RENDER_OVERLAY_LAYOUT.text;
  const fontSize = useMemo(
    () =>
      fontReady
        ? overlayFontSize({
            displayName,
            height,
            intro,
            measure: measureOverlayText,
            width,
          })
        : null,
    [displayName, fontReady, height, intro, width]
  );

  const timing = overlayTiming({ durationInFrames, fps, frame });
  if (timing === null || fontSize === null) {
    return null;
  }
  const { line1Top, line2Top, logo } = overlayGeometry({
    fontSize,
    height,
    width,
  });
  const line = {
    color,
    fontFamily: OVERLAY_FONT_STACK,
    fontSize,
    fontWeight: Number(OVERLAY_FONT_WEIGHT),
    left: "50%",
    lineHeight: OVERLAY_LINE_HEIGHT,
    position: "absolute",
    transform: "translateX(-50%)",
    whiteSpace: "nowrap",
  } as const;

  return (
    <div
      style={{
        inset: 0,
        opacity: timing.opacity,
        position: "absolute",
        transform: `translateY(${timing.translateY}px)`,
      }}
    >
      {logoUrl ? (
        <Img
          onError={failLogo}
          src={logoUrl}
          style={{
            height: logo.height,
            left: logo.left,
            objectFit: "contain",
            position: "absolute",
            top: logo.top,
            width: logo.width,
          }}
        />
      ) : null}
      <div style={{ ...line, top: line1Top }}>{intro}</div>
      <div style={{ ...line, top: line2Top }}>{displayName}</div>
    </div>
  );
}
