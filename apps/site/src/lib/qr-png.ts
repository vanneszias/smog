/** The downloaded QR code's width and height, in pixels (print size). */
export const QR_PNG_SIZE = 1024;

function loadSvgImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("[qr] The QR code did not load"));
    image.src = source;
  });
}

export interface QrPngDeps {
  createCanvas?: () => HTMLCanvasElement;
  loadImage?: (source: string) => Promise<HTMLImageElement>;
}

/**
 * The QR code SVG shown in the dialog, drawn at click time onto a fixed
 * 1024 × 1024 canvas (white behind it) as a PNG data URL. A fixed canvas,
 * not a `QRCodeCanvas`, because that one scales its backing store with
 * `devicePixelRatio` (a 3072 px PNG and ~37 MB of canvas on a phone).
 */
export async function qrPngDataUrl(
  svg: SVGSVGElement,
  {
    createCanvas = () => document.createElement("canvas"),
    loadImage = loadSvgImage,
  }: QrPngDeps = {}
): Promise<string> {
  const markup = new XMLSerializer().serializeToString(svg);
  const image = await loadImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
  );
  const canvas = createCanvas();
  canvas.width = QR_PNG_SIZE;
  canvas.height = QR_PNG_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("[qr] No 2D canvas");
  }
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, QR_PNG_SIZE, QR_PNG_SIZE);
  context.drawImage(image, 0, 0, QR_PNG_SIZE, QR_PNG_SIZE);
  return canvas.toDataURL("image/png");
}
