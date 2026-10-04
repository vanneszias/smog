/**
 * `@smog/render/metadata` (phase 7 ruling 5): the source video's duration
 * and size, which the caller passes to `SponsoredVideo`. It runs in Bun (the
 * render server), never in workerd. The browser reads Mux's MP4 renditions
 * through `./metadata/mp4`, which bundles one demuxer instead of all of
 * them (fix wave M-3).
 */
import { ALL_FORMATS } from "mediabunny";
import {
  type ReadSourceOptions,
  readMetadata,
  type SourceMetadata,
} from "./read";

// biome-ignore lint/performance/noBarrelFile: the package's `./metadata` entry.
export {
  type MetadataInput,
  type ReadSourceOptions,
  SourceFetchError,
  type SourceMetadata,
  SourceUnreadableError,
} from "./read";

/** Reads any container `mediabunny` knows (the render server's sources). */
export function readSourceMetadata(
  url: string,
  options: ReadSourceOptions = {}
): Promise<SourceMetadata> {
  return readMetadata(url, ALL_FORMATS, options);
}
