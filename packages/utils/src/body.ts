/** A request body read up to a cap, or the status that refuses it. */
export type CappedBody =
  | { bytes: Uint8Array<ArrayBuffer>; ok: true }
  | { ok: false; status: 400 | 413 };

const DIGITS = /^\d{1,15}$/;

/**
 * Reads at most `maxBytes` of a request body (webhooks, uploads). A
 * declared `content-length` over the cap is refused before any read (413),
 * a malformed one is a 400, and a streamed body is counted and cancelled
 * once past the cap, so a large body is never buffered. A client that goes
 * away mid-body is a 400, never a 500.
 */
export async function readCappedBody(
  request: Request,
  maxBytes: number
): Promise<CappedBody> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!DIGITS.test(declared)) {
      return { ok: false, status: 400 };
    }
    if (Number.parseInt(declared, 10) > maxBytes) {
      return { ok: false, status: 413 };
    }
  }
  if (!request.body) {
    return { bytes: new Uint8Array(0), ok: true };
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    let chunk: Awaited<ReturnType<typeof reader.read>>;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: a stream is read chunk by chunk.
      chunk = await reader.read();
    } catch {
      return { ok: false, status: 400 };
    }
    if (chunk.done) {
      break;
    }
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, status: 413 };
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, ok: true };
}
