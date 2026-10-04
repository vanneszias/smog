/**
 * `@smog/render/composition` (phase 7 ruling 1): the sponsored video's
 * React composition (`remotion`, no renderer), for the render server's
 * bundle and the wizard's Player. Never imported in workerd.
 */
// biome-ignore-all lint/performance/noBarrelFile: the package's `./composition` entry.
export {
  OVERLAY_FONT_FAMILY,
  OVERLAY_FONT_FILES,
  OVERLAY_FONT_WEIGHT,
} from "./font";
export { SponsoredVideo, type SponsoredVideoProps } from "./sponsored-video";
