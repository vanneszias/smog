import { afterEach, describe, expect, test } from "bun:test";
import { QR_PNG_SIZE, qrPngDataUrl } from "./qr-png";

const SVG_NS = "http://www.w3.org/2000/svg";

afterEach(() => {
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value: 1,
  });
});

describe("qrPngDataUrl", () => {
  test("draws a fixed 1024 px PNG from the SVG, whatever the screen density", async () => {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 3,
    });
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 29 29");
    svg.setAttribute("width", "256");
    const drawn: unknown[][] = [];
    const canvas = {
      getContext: () => ({
        drawImage: (...args: unknown[]) => drawn.push(args),
        fillRect: (...args: unknown[]) => drawn.push(["fill", ...args]),
        fillStyle: "",
        imageSmoothingEnabled: true,
      }),
      height: 0,
      toDataURL: (type: string) => `data:${type};base64,AAAA`,
      width: 0,
    };
    const sources: string[] = [];
    const image = {} as HTMLImageElement;
    const url = await qrPngDataUrl(svg, {
      createCanvas: () => canvas as unknown as HTMLCanvasElement,
      loadImage: (source) => {
        sources.push(source);
        return Promise.resolve(image);
      },
    });

    expect(QR_PNG_SIZE).toBe(1024);
    expect([canvas.width, canvas.height]).toEqual([1024, 1024]);
    expect(drawn).toEqual([
      ["fill", 0, 0, 1024, 1024],
      [image, 0, 0, 1024, 1024],
    ]);
    expect(url).toBe("data:image/png;base64,AAAA");
    expect(sources[0]?.startsWith("data:image/svg+xml")).toBe(true);
  });
});
