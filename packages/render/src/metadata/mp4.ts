/**
 * `@smog/render/metadata/mp4`: the wizard Player's source reader (phase 7
 * ruling 8). Mux's static renditions are MP4, so only `mediabunny`'s MP4
 * demuxer is registered and bundled (fix wave M-3); the render server
 * reads every format through `./metadata`.
 */
import { MP4 } from "mediabunny";
import {
  type ReadSourceOptions,
  readMetadata,
  type SourceMetadata,
} from "./read";

// biome-ignore lint/performance/noBarrelFile: the package's `./metadata/mp4` entry.
export {
  type ReadSourceOptions,
  SourceFetchError,
  type SourceMetadata,
  SourceUnreadableError,
} from "./read";

/** `readSourceMetadata` for an MP4 (a Mux rendition), abortable. */
export function readMp4Metadata(
  url: string,
  options: ReadSourceOptions = {}
): Promise<SourceMetadata> {
  return readMetadata(url, [MP4], options);
}
