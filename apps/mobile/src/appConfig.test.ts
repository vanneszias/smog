import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

interface SplashOptions {
  backgroundColor?: string;
  dark?: { backgroundColor?: string; image?: string };
  image?: string;
}

interface AppJson {
  expo: {
    android: {
      adaptiveIcon: {
        backgroundColor?: string;
        backgroundImage?: string;
        foregroundImage?: string;
        monochromeImage?: string;
      };
    };
    icon: string;
    ios: { icon?: string };
    plugins: (string | [string, unknown])[];
    web: { favicon: string };
  };
}

const appJson: AppJson = JSON.parse(
  readFileSync(join(ROOT, "app.json"), "utf8")
);
const { expo } = appJson;

function splashOptions(): SplashOptions {
  const entry = expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen"
  );

  if (!Array.isArray(entry)) {
    throw new Error("expo-splash-screen is not configured in app.json");
  }

  return entry[1] as SplashOptions;
}

/** Every string anywhere in app.json that names a file under `assets/`. */
function assetPaths(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string" && value.startsWith("./assets/")) {
    found.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      assetPaths(item, found);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) {
      assetPaths(item, found);
    }
  }

  return found;
}

/**
 * A missing icon or splash image does not fail `expo export` or any test
 * that renders a screen — prebuild only warns, and the store build then
 * ships a blank or default icon. This checks the files exist up front.
 */
describe("app.json's icons and splash screen", () => {
  it("points every asset path at a file that exists", () => {
    const paths = assetPaths(expo);

    expect(paths.length).toBeGreaterThan(5);
    for (const path of paths) {
      expect({ path, exists: existsSync(join(ROOT, path)) }).toEqual({
        path,
        exists: true,
      });
    }
  });

  it("uses the store icon as the icon every platform falls back to", () => {
    expect(expo.icon).toBe("./assets/icon.png");
  });

  it("gives iOS the layered Icon Composer package", () => {
    expect(expo.ios.icon).toBe("./assets/smog.icon");

    const dir = join(ROOT, "assets/smog.icon");

    expect(statSync(dir).isDirectory()).toBe(true);
    expect(existsSync(join(dir, "icon.json"))).toBe(true);
  });

  it("builds the Android adaptive icon from the foreground on brand green", () => {
    const { adaptiveIcon } = expo.android;

    expect(adaptiveIcon.foregroundImage).toBe(
      "./assets/android-icon-foreground.png"
    );
    expect(adaptiveIcon.monochromeImage).toBe(
      "./assets/android-icon-monochrome.png"
    );
    expect(adaptiveIcon.backgroundColor).toBe("#00805F");
    // A background image overrides `backgroundColor`.
    expect(adaptiveIcon).not.toHaveProperty("backgroundImage");
  });

  it("keeps the web favicon", () => {
    expect(expo.web.favicon).toBe("./assets/favicon.png");
  });

  it("shows the logo on brand green in both light and dark splash screens", () => {
    const splash = splashOptions();

    expect(splash.image).toBe("./assets/splash-icon.png");
    expect(splash.backgroundColor).toBe("#00805F");
    expect(splash.dark).toEqual({
      backgroundColor: "#00805F",
      image: "./assets/splash-icon.png",
    });
  });
});
