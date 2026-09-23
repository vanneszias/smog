import { en, fr, nl } from "@smog/i18n";
import { act, renderHook } from "@testing-library/react-native";
import { setLocale, t, useLocale } from "@/lib/i18n";

/**
 * `setLocale` is module-level state (see `i18n.ts`'s own comment), so it
 * outlives any one `it()` — every test resets it back to Dutch first,
 * rather than relying on the order tests run in.
 */
beforeEach(() => {
  setLocale("nl");
});

describe("translations", () => {
  it("returns the Dutch string by default", () => {
    expect(t("search.placeholder")).toBe(nl.search.placeholder);
  });

  it("returns the French string when the locale is French", () => {
    setLocale("fr");

    expect(t("search.placeholder")).toBe(fr.search.placeholder);
  });

  /**
   * `auth.forgotPassword` is a real gap in the `@smog/i18n` catalog, not a
   * made-up key: `en.json` never got it. The premise is asserted first so this test fails
   * loudly, rather than passing for the wrong reason, the day someone adds
   * the key to `en.json` and this stops exercising the fallback path at
   * all.
   */
  it("falls back to Dutch for a key missing in a locale", () => {
    expect((en.auth as Record<string, unknown>).forgotPassword).toBeUndefined();

    setLocale("en");

    expect(t("auth.forgotPassword")).toBe(nl.auth.forgotPassword);
  });

  it("returns the key itself rather than blank for a key in no locale", () => {
    expect(t("nothing.here")).toBe("nothing.here");
  });

  /**
   * The one assertion in this file that is a finding rather than a check on
   * this app's code: it fails today, against the `@smog/i18n` catalog as it
   * stands, on keys that no screen in `apps/mobile` reads. `it.failing` keeps
   * the assertion in the suite while keeping `bun -F mobile test` green. If a
   * future change fills them, this test starts *passing*, which makes
   * `it.failing` itself fail — the signal to flip it back to `it`.
   */
  it.failing("has the same key set in all three locales", () => {
    const keys = (o: object, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === "object" && v !== null
          ? keys(v, `${p}${k}.`)
          : [`${p}${k}`]
      );

    expect(keys(fr).sort()).toEqual(keys(nl).sort());
    expect(keys(en).sort()).toEqual(keys(nl).sort());
  });
});

describe("useLocale", () => {
  it("starts at the active locale and updates on setLocale", () => {
    const { result } = renderHook(() => useLocale());

    expect(result.current.locale).toBe("nl");

    act(() => {
      result.current.setLocale("fr");
    });

    expect(result.current.locale).toBe("fr");
  });

  it("reacts to a setLocale call made outside the hook entirely", () => {
    const { result } = renderHook(() => useLocale());

    act(() => {
      setLocale("en");
    });

    expect(result.current.locale).toBe("en");
  });
});
