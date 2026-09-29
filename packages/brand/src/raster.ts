import sharp from "sharp";
import { GREEN } from "./compose";

/** Renders one planned SVG to a PNG, deterministically (sharp/libvips). */
export async function rasterise(svg: string, opaque: boolean): Promise<Buffer> {
  const image = sharp(Buffer.from(svg));
  const flat = opaque ? image.flatten({ background: GREEN }) : image;
  return await flat.png({ compressionLevel: 9 }).toBuffer();
}

export interface Pixels {
  channels: number;
  data: Buffer;
  height: number;
  width: number;
}

/** Decodes a PNG (or renders an SVG) to raw RGBA pixels, for comparison. */
export async function rgba(input: Buffer): Promise<Pixels> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    channels: info.channels,
    data,
    height: info.height,
    width: info.width,
  };
}
