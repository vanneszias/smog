import { AbsoluteFill } from "remotion";
import { Background } from "./background";
import type { SponsoredVideoProps } from "./props";
import { SponsorOverlay } from "./sponsor-overlay";

/**
 * The sponsored video (a port of the old `apps/remotion` `SponsoredVideo`,
 * phase 7 ruling 5): the source `cover`-fitted on black, with the sponsor
 * overlay over its last seconds. The render server and the wizard's Player
 * mount it with the same props (`sponsoredVideoPropsSchema`); the size and
 * duration are the composition's own, from the props.
 */
export function SponsoredVideo({
  background,
  displayName,
  logoUrl,
}: SponsoredVideoProps): React.ReactNode {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Background background={background} />
      <SponsorOverlay displayName={displayName} logoUrl={logoUrl} />
    </AbsoluteFill>
  );
}
