/**
 * The natural size of the gesture's Mux poster, for the Player's image
 * fallback (fix wave M-5): the composition then has the source's own
 * shape, so the overlay lands where the render puts it, whatever the
 * gesture's aspect ratio. Only `sponsor-preview.tsx` (the lazy chunk) uses
 * it. `img-src` already allows `image.mux.com`; reading the size needs no
 * CORS.
 */
export interface PosterSize {
  height: number;
  width: number;
}

/** Loads `src` as an image and answers its natural size; the signal aborts. */
export function readPosterSize(
  src: string,
  signal: AbortSignal
): Promise<PosterSize> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const done = (): void => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener("abort", abort);
    };
    const abort = (): void => {
      done();
      image.src = "";
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    image.onload = () => {
      done();
      resolve({ height: image.naturalHeight, width: image.naturalWidth });
    };
    image.onerror = () => {
      done();
      reject(new Error("the poster could not be loaded"));
    };
    image.decoding = "async";
    image.src = src;
  });
}
