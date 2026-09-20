import { afterEach, describe, expect, it } from "vitest";
import {
  applyTheme,
  DARK_CLASS,
  resolveTheme,
  THEME_STORAGE_KEY,
  themeInitScript,
  toggleTheme,
} from "./theme";

/*
 * jsdom implements no `matchMedia`, and `themeInitScript` calls it. Installed
 * at module scope rather than in a `beforeAll`: the script under test reads
 * `window.matchMedia` at call time, but a shim installed in a hook is absent
 * while the module graph is still being evaluated, which is exactly when a
 * different test file's import could reach it. Module scope is the only point
 * that is unambiguously before everything.
 *
 * `prefersDark` is a module-level box the shim reads, so a test can move the
 * operating system preference without reinstalling anything.
 */
let prefersDark = false;

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: query.includes("dark") && prefersDark,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
  writable: true,
});

/** Runs the generated script the way a `<script>` tag would. */
const runInitScript = (): void => {
  // biome-ignore lint/security/noGlobalEval: the whole point of this test is that the *string* `themeInitScript` produces is executable and correct. Asserting on its text would pin the spelling and prove nothing about the behaviour; running it is the only assertion worth making, and the input is this module's own output, not anything external.
  eval(themeInitScript());
};

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove(DARK_CLASS);
  prefersDark = false;
});

describe("resolveTheme", () => {
  it("honours a stored dark choice over the system preference", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("honours a stored light choice over the system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("falls back to the system preference when nothing is stored", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  it("falls back to the system preference for a value that names no theme", () => {
    expect(resolveTheme("sepia", true)).toBe("dark");
    expect(resolveTheme("", false)).toBe("light");
  });
});

describe("toggleTheme", () => {
  it("goes dark from light", () => {
    expect(toggleTheme("light")).toBe("dark");
  });

  it("goes light from dark", () => {
    expect(toggleTheme("dark")).toBe("light");
  });
});

describe("applyTheme", () => {
  it("adds the dark class", () => {
    applyTheme(document.documentElement, "dark");

    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });

  it("removes a dark class that is already there", () => {
    document.documentElement.classList.add(DARK_CLASS);

    applyTheme(document.documentElement, "light");

    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
  });

  it("leaves other classes on the element alone", () => {
    document.documentElement.classList.add("something-else");

    applyTheme(document.documentElement, "dark");

    expect(document.documentElement.classList.contains("something-else")).toBe(
      true
    );
  });
});

describe("themeInitScript", () => {
  it("sets the dark class from a stored dark choice", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    runInitScript();

    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });

  it("clears a dark class when the stored choice is light", () => {
    document.documentElement.classList.add(DARK_CLASS);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    prefersDark = true;

    runInitScript();

    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
  });

  it("uses the system preference when nothing is stored", () => {
    prefersDark = true;

    runInitScript();

    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });

  it("stays light when nothing is stored and the system prefers light", () => {
    runInitScript();

    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
  });

  it("reads the key this module exports, not a hard-coded one", () => {
    expect(themeInitScript()).toContain(JSON.stringify(THEME_STORAGE_KEY));
  });

  it("survives a localStorage that throws, which is a private window", () => {
    const own = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => undefined,
        getItem: () => {
          throw new Error("SecurityError");
        },
      },
    });

    try {
      expect(() => runInitScript()).not.toThrow();
    } finally {
      if (own) {
        Object.defineProperty(window, "localStorage", own);
      } else {
        Reflect.deleteProperty(window, "localStorage");
      }
    }
  });
});
