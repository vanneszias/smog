/**
 * Synthetic audio files for the tests (no Workers imports: the e2e specs
 * use them too). They are valid in structure, not in sound: a run of
 * silent MPEG-1 Layer III frames, and an M4A with the boxes the verifier
 * reads.
 */

/** MPEG-1 Layer III, 128 kbit/s, 44.1 kHz: 417 bytes and 26.12 ms per frame (no padding). */
const FRAME_BYTES = 417;
const FRAME_MS = (1152 / 44_100) * 1000;

/** An MP3 of about `seconds` seconds, with an optional ID3v2 tag in front. */
export function mp3Bytes(
  seconds: number,
  options: { id3?: boolean } = {}
): Uint8Array<ArrayBuffer> {
  const frames = Math.max(1, Math.round((seconds * 1000) / FRAME_MS));
  const tag = options.id3
    ? Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 4, 1, 2, 3, 4])
    : new Uint8Array(0);
  const bytes = new Uint8Array(tag.length + frames * FRAME_BYTES);
  bytes.set(tag, 0);
  for (let index = 0; index < frames; index += 1) {
    // Sync, MPEG-1 Layer III without CRC, 128 kbit/s at 44.1 kHz, then a silent body.
    bytes.set([0xff, 0xfb, 0x90, 0x00], tag.length + index * FRAME_BYTES);
  }
  return bytes;
}

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const size = 8 + parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, size);
  out.set(new TextEncoder().encode(type), 4);
  let at = 8;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function u32(...values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((value, index) => {
    view.setUint32(index * 4, value);
  });
  return out;
}

/**
 * An M4A of `seconds` seconds whose only track has the handler `handler`
 * (`soun` for audio). `samplesSeconds` makes the sample tables say another
 * length than the movie header (a file that understates its `mvhd`).
 */
export function m4aBytes(
  seconds: number,
  handler = "soun",
  { samplesSeconds = seconds }: { samplesSeconds?: number } = {}
): Uint8Array<ArrayBuffer> {
  const timescale = 1000;
  const ftyp = box(
    "ftyp",
    new TextEncoder().encode("M4A "),
    u32(0),
    new TextEncoder().encode("M4A isom")
  );
  // version/flags, created, modified, timescale, duration, rate, volume, ...
  const mvhd = box(
    "mvhd",
    u32(0, 0, 0, timescale, Math.round(seconds * timescale)),
    new Uint8Array(80)
  );
  const hdlr = box(
    "hdlr",
    u32(0, 0),
    new TextEncoder().encode(handler),
    new Uint8Array(12)
  );
  // AAC: 1024 samples per frame at 44.1 kHz.
  const sampleRate = 44_100;
  const frames = Math.floor((samplesSeconds * sampleRate) / 1024);
  const mdhd = box(
    "mdhd",
    u32(0, 0, 0, sampleRate, frames * 1024),
    new Uint8Array(4)
  );
  const stts = box("stts", u32(0, 1, frames, 1024));
  const stsz = box("stsz", u32(0, 0, frames));
  const trak = box(
    "trak",
    box("mdia", mdhd, hdlr, box("minf", box("stbl", stts, stsz)))
  );
  const mdat = box("mdat", new Uint8Array(2000));
  // `moov` after `mdat`: the common layout of a file that was not streamed.
  return Uint8Array.from([...ftyp, ...mdat, ...box("moov", mvhd, trak)]);
}
