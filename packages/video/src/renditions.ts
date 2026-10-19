/**
 * `@smog/video/renditions`: the public static MP4 renditions of a playback
 * id, `highest.mp4` then `high.mp4`. The one list both readers try: the
 * render's fallback source (`firstReachable`, phase 7 ruling 4) and the
 * wizard's Player (`apps/site` `use-source-metadata.ts`, ruling 8; fix wave
 * M-4). They are public, not signed, so they may appear in step state. No
 * Mux credentials here: client safe, unlike the package's `.` entry.
 */
const MUX_STREAM_ORIGIN = "https://stream.mux.com";

/** `highest.mp4`, then `high.mp4`. */
export function renditionUrls(playbackId: string): string[] {
  const base = `${MUX_STREAM_ORIGIN}/${encodeURIComponent(playbackId)}`;
  return [`${base}/highest.mp4`, `${base}/high.mp4`];
}
