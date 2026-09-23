/**
 * Browser APIs jsdom does not implement, installed at **module scope**.
 *
 * Every overlay in this package is positioned by Radix's Popper or measured by
 * a focus scope, and both reach for APIs jsdom has never had. They are
 * installed here — at the top level of a module the test files import — rather
 * than inside a `beforeAll`, because a throw in `beforeAll` fails the whole
 * file *without failing any named test*: Vitest then reports the remaining
 * tests as **skipped**, which reads like success in a scrolling log.
 *
 * An `import "../test/jsdomShims"` runs this file before the importing test
 * module's own body, so the guarantee survives the extraction into a module.
 *
 * Every shim is conditional (`??=` or an `in` check), so a jsdom release that
 * grows a real implementation keeps it.
 */

if (!("ResizeObserver" in globalThis)) {
  Object.assign(globalThis, {
    ResizeObserver: class {
      observe() {
        // jsdom lays nothing out, so there is nothing to observe
      }
      unobserve() {
        // jsdom lays nothing out, so there is nothing to observe
      }
      disconnect() {
        // jsdom lays nothing out, so there is nothing to observe
      }
    },
  });
}

if (!("DOMRect" in globalThis)) {
  Object.assign(globalThis, {
    DOMRect: class {
      static fromRect(rect?: {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
      }) {
        return new DOMRect(rect?.x, rect?.y, rect?.width, rect?.height);
      }
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      constructor(x = 0, y = 0, width = 0, height = 0) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
      }
      get top() {
        return this.y;
      }
      get left() {
        return this.x;
      }
      get right() {
        return this.x + this.width;
      }
      get bottom() {
        return this.y + this.height;
      }
      toJSON() {
        return { ...this };
      }
    },
  });
}

Element.prototype.scrollIntoView ??= () => {
  // jsdom has no scrolling
};

Element.prototype.hasPointerCapture ??= () => false;

Element.prototype.setPointerCapture ??= () => {
  // jsdom has no pointer capture
};

Element.prototype.releasePointerCapture ??= () => {
  // jsdom has no pointer capture
};

/*
 * `matchMedia` is the one shim that cannot use an `in` check: jsdom declares
 * the property on the window and leaves it `undefined`, so `"matchMedia" in
 * globalThis` is already true and the guard would skip the shim while every
 * caller still reads `undefined` and throws. Typeof is the honest test, and it
 * still steps aside for a jsdom release that grows a real implementation.
 */
if (typeof (globalThis as { matchMedia?: unknown }).matchMedia !== "function") {
  Object.assign(globalThis, {
    matchMedia: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {
          // deprecated API, nothing to add
        },
        removeListener: () => {
          // deprecated API, nothing to remove
        },
        addEventListener: () => {
          // jsdom never changes viewport, so nothing ever fires
        },
        removeEventListener: () => {
          // jsdom never changes viewport, so nothing ever fires
        },
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}
