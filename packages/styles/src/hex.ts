/**
 * Hex colour arithmetic, shared by the ramp generator and the contrast
 * checker so the two cannot disagree about what a hex string means.
 */

const HEX_RADIX = 16;
const HEX_PAIR = 2;
const CHANNELS = 3;
const SIX_DIGIT_HEX = /^#?[0-9a-f]{6}$/i;

type Rgb = readonly [number, number, number];

/** Parses `#RRGGBB` (hash optional, case insensitive) into 0–255 channels. */
export function parseHex(hex: string): Rgb {
  if (!SIX_DIGIT_HEX.test(hex)) {
    throw new Error(`Expected a six-digit hex colour, received "${hex}"`);
  }

  const value = hex.replace("#", "");
  const channels: number[] = [];
  for (let index = 0; index < CHANNELS; index++) {
    const start = index * HEX_PAIR;
    channels.push(
      Number.parseInt(value.slice(start, start + HEX_PAIR), HEX_RADIX)
    );
  }

  return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0];
}

/** Formats 0–255 channels as an uppercase `#RRGGBB` string. */
function formatHex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) =>
      Math.round(channel).toString(HEX_RADIX).padStart(HEX_PAIR, "0")
    )
    .join("")
    .toUpperCase()}`;
}

/** Linear interpolation between two hex colours in sRGB space. */
export function mixHex(from: string, to: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  return formatHex([
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ]);
}
