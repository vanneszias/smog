/**
 * A placeholder `SponsoredVideo` (phase 7 task 1): it proves that the
 * Remotion bundle resolves the contract, the tokens and the font file.
 * Task 3 replaces it with the port of the old composition.
 */
import { AbsoluteFill } from "remotion";
import { RENDER_OVERLAY_LAYOUT } from "../contract";
import {
  OVERLAY_FONT_FAMILY,
  OVERLAY_FONT_FILES,
  OVERLAY_FONT_WEIGHT,
} from "./font";

// `<Composition>` takes props that are a `Record<string, unknown>`.
export interface SponsoredVideoProps extends Record<string, unknown> {
  displayName: string;
  durationInFrames: number;
  height: number;
  width: number;
}

const FONT_FACES = OVERLAY_FONT_FILES.map(
  ({ url }) =>
    `@font-face{font-family:"${OVERLAY_FONT_FAMILY}";font-weight:${OVERLAY_FONT_WEIGHT};src:url("${url}") format("woff2")}`
).join("");

export function SponsoredVideo({
  displayName,
  height,
}: SponsoredVideoProps): React.ReactNode {
  const { text } = RENDER_OVERLAY_LAYOUT;
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <style>{FONT_FACES}</style>
      <div
        style={{
          color: text.color,
          fontFamily: OVERLAY_FONT_FAMILY,
          fontSize: text.fontSize * height,
          fontWeight: Number(OVERLAY_FONT_WEIGHT),
          lineHeight: 1.2,
          position: "absolute",
          textAlign: "center",
          top: text.y * height,
          width: "100%",
        }}
      >
        <div>{text.intro}</div>
        <div>{displayName}</div>
      </div>
    </AbsoluteFill>
  );
}
