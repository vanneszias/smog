/**
 * The job's logo (phase 7 rulings 7 and 10): the Worker sends it as a
 * `data:` URL, the server decodes it to a temp file and serves it to its
 * own render at `http://127.0.0.1:<port>/assets/<renderJobId>/logo`, so the
 * composition gets a short URL instead of a 2.7 MB base64 input prop
 * (Minor 10). Only the current job's logo is served, only to loopback.
 */
import { RENDER_LOGO_MAX_BYTES } from "../contract";
import { RenderServerError } from "./errors";

export type LogoContentType = "image/jpeg" | "image/png" | "image/webp";

export interface DecodedLogo {
  bytes: Uint8Array;
  contentType: LogoContentType;
}

const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,(.*)$/s;

function startsWith(bytes: Uint8Array, prefix: readonly number[], at = 0) {
  return prefix.every((byte, index) => bytes[at + index] === byte);
}

/** The type the bytes are, by their magic bytes (the checkout's check). */
export function sniffLogoType(bytes: Uint8Array): LogoContentType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Decodes the request's logo. The schema has already checked the shape
 * and the size; the bytes must also be the type they claim
 * (`logoUnreadable`, final, otherwise).
 */
export function decodeLogoDataUrl(dataUrl: string): DecodedLogo {
  const [, type, payload] = dataUrl.match(DATA_URL) ?? [];
  const declared = type as LogoContentType | undefined;
  const bytes = payload ? Buffer.from(payload, "base64") : null;
  if (!(declared && bytes) || bytes.byteLength === 0) {
    throw new RenderServerError("logoUnreadable", "the logo is not readable");
  }
  if (bytes.byteLength > RENDER_LOGO_MAX_BYTES) {
    throw new RenderServerError(
      "logoUnreadable",
      `the logo is larger than ${RENDER_LOGO_MAX_BYTES} bytes`
    );
  }
  if (sniffLogoType(bytes) !== declared) {
    throw new RenderServerError(
      "logoUnreadable",
      `the logo is not a ${declared.slice("image/".length).toUpperCase()} image`
    );
  }
  return { bytes: new Uint8Array(bytes), contentType: declared };
}

/** Where the render reads the logo, on the server's own loopback port. */
export function logoAssetUrl(port: number, renderJobId: string): string {
  return `http://127.0.0.1:${port}${logoAssetPath(renderJobId)}`;
}

function logoAssetPath(renderJobId: string): string {
  return `/assets/${encodeURIComponent(renderJobId)}/logo`;
}

const ASSET_ROUTE = /^\/assets\/([^/]+)\/logo$/;

/** The job id of a logo asset path, or `null` for another path. */
export function matchLogoAssetPath(pathname: string): string | null {
  const [, id] = pathname.match(ASSET_ROUTE) ?? [];
  return id ? decodeURIComponent(id) : null;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Whether a peer address is this machine (the render's own browser). */
export function isLoopback(address: string | null | undefined): boolean {
  return address !== null && address !== undefined && LOOPBACK.has(address);
}

interface LogoAsset {
  contentType: LogoContentType;
  path: string;
}

/** The logos being served: at most the current job's. */
export interface LogoAssets {
  get: (renderJobId: string) => LogoAsset | null;
  remove: (renderJobId: string, path: string) => void;
  set: (renderJobId: string, asset: LogoAsset) => void;
}

export function createLogoAssets(): LogoAssets {
  const assets = new Map<string, LogoAsset>();
  return {
    get: (renderJobId) => assets.get(renderJobId) ?? null,
    remove: (renderJobId, path) => {
      // A newer attempt of the same job may already have its own file.
      if (assets.get(renderJobId)?.path === path) {
        assets.delete(renderJobId);
      }
    },
    set: (renderJobId, asset) => {
      assets.set(renderJobId, asset);
    },
  };
}
