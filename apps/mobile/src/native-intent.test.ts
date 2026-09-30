import { describe, expect, it } from "@jest/globals";
import { redirectSystemPath } from "../app/+native-intent";

const ORIGIN = "https://smog.example";

const redirect = (path: string, initial = false): string =>
  redirectSystemPath({ initial, path });

describe("redirectSystemPath", () => {
  it.each([
    [`${ORIGIN}/gestures/hond`, "/gestures/hond"],
    ["/gestures/hond", "/gestures/hond"],
    ["smog://gestures/hond", "/gestures/hond"],
    ["smog:///gestures/hond", "/gestures/hond"],
    [`${ORIGIN}/gestures/hond/`, "/gestures/hond"],
    [`${ORIGIN}/gestures/hond?ref=qr#top`, "/gestures/hond"],
    ["exp://192.168.1.10:8081/--/gestures/hond", "/gestures/hond"],
  ])("opens the gesture link %s on the gesture screen", (path, expected) => {
    expect(redirect(path)).toBe(expected);
    expect(redirect(path, true)).toBe(expected);
  });

  it("routes a legacy (Convex) id like a slug: the screen resolves it", () => {
    expect(redirect(`${ORIGIN}/gestures/k57d8m2x9q0v3c1b`)).toBe(
      "/gestures/k57d8m2x9q0v3c1b"
    );
  });

  it("keeps an encoded slug encoded", () => {
    expect(redirect(`${ORIGIN}/gestures/caf%C3%A9`)).toBe(
      "/gestures/caf%C3%A9"
    );
  });

  it.each([
    [`${ORIGIN}/lists/Zm9vYmFyYmF6`, "/shared/Zm9vYmFyYmF6"],
    ["smog://lists/Zm9vYmFyYmF6", "/shared/Zm9vYmFyYmF6"],
    ["/lists/Zm9v_-Ym?x=1", "/shared/Zm9v_-Ym"],
  ])(
    "opens the shared list link %s on the shared list screen",
    (path, expected) => {
      expect(redirect(path)).toBe(expected);
    }
  );

  it.each([
    [`${ORIGIN}/gestures`, "/search"],
    [`${ORIGIN}/gestures/`, "/search"],
    [`${ORIGIN}/gestures?q=hond`, "/search?q=hond"],
    [`${ORIGIN}/gestures?q=caf%C3%A9&page=2`, "/search?q=caf%C3%A9"],
    [
      `${ORIGIN}/gestures?category=dieren,eten&q=kat`,
      "/search?q=kat&category=dieren%2Ceten",
    ],
    ["/gestures?q=", "/search"],
  ])("opens the gesture browser %s on the search tab", (path, expected) => {
    expect(redirect(path)).toBe(expected);
  });

  it.each([
    ["/", "/"],
    [ORIGIN, "/"],
    [`${ORIGIN}/`, "/"],
    ["smog://", "/"],
    ["smog:///", "/"],
    [`${ORIGIN}/favorites`, "/favorites"],
    [`${ORIGIN}/lists`, "/lists"],
    ["/search?q=kat", "/search?q=kat"],
    ["smog://shared/abc", "/shared/abc"],
    ["smog://settings", "/settings"],
    ["/sign-in", "/sign-in"],
  ])("maps the app route %s to itself", (path, expected) => {
    expect(redirect(path)).toBe(expected);
  });

  it.each([
    `${ORIGIN}/gestures/hond/video`,
    `${ORIGIN}/lists/a/b`,
    `${ORIGIN}/sponsor`,
    `${ORIGIN}/admin/gestures`,
    `${ORIGIN}/api/rpc/gestures/list`,
    "smog://unknown/thing",
    "mailto:info@smog.vlaanderen",
    "exp://192.168.1.10:8081",
  ])("sends the unknown link %s home", (path) => {
    expect(redirect(path)).toBe("/");
  });

  it.each([".", "..", "%2E", "%2E%2E"])(
    "sends the dot-segment id %s home",
    (id) => {
      expect(redirect(`${ORIGIN}/gestures/${id}`)).toBe("/");
      expect(redirect(`${ORIGIN}/lists/${id}`)).toBe("/");
    }
  );

  it.each([
    `${ORIGIN}/gestures/%E0%A4%A`,
    `${ORIGIN}/lists/%`,
    `${ORIGIN}/gestures?q=%E0%A4%A`,
    "",
    "%%%",
    "https://",
    "::::",
  ])("sends the malformed link %s home without throwing", (path) => {
    expect(() => redirect(path)).not.toThrow();
    expect(redirect(path)).toBe("/");
  });

  it("never throws, whatever it is given", () => {
    const weird = [
      undefined,
      null,
      42,
      {},
      "\u0000",
      "https://smog.example/gestures/\uD800",
    ] as unknown as string[];
    for (const path of weird) {
      expect(redirect(path)).toBe("/");
    }
  });

  const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEF";

  it.each([
    `${ORIGIN}/magic-link/app?token=${TOKEN}`,
    `${ORIGIN}/magic-link/app?callbackURL=https%3A%2F%2Fevil.test&token=${TOKEN}`,
    `smog://magic-link/app?token=${TOKEN}`,
    `/magic-link?token=${TOKEN}`,
  ])(
    "opens the app's magic link %s on the magic-link screen, token only",
    (path) => {
      expect(redirect(path)).toBe(`/magic-link?token=${TOKEN}`);
    }
  );

  it.each([
    `${ORIGIN}/magic-link/app`,
    `${ORIGIN}/magic-link/app?token=short`,
    `${ORIGIN}/magic-link/app?token=%3Cscript%3E${TOKEN}`,
    `${ORIGIN}/magic-link?error=INVALID_TOKEN`,
    `${ORIGIN}/magic-link/other?token=${TOKEN}`,
  ])(
    "sends the malformed magic link %s to the magic-link screen without a token",
    (path) => {
      expect(redirect(path)).toBe("/magic-link");
    }
  );
});
