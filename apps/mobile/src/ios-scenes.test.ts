import { describe, expect, it } from "@jest/globals";
import type { ExportedConfig } from "expo/config-plugins";
import withIosScenes from "../plugins/with-ios-scenes";

const LEGACY_APP = `class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?
  var reactNativeFactory: RCTReactNativeFactory?
  func start() {
#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
  }
  func open() -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }
}`;

type Mod<T> = (config: {
  modResults: T;
  modRequest: Record<string, unknown>;
}) => Promise<{ modResults: T }>;

async function apply<T>(
  name: "appDelegate" | "infoPlist",
  input: T
): Promise<T> {
  const config = withIosScenes({
    name: "test",
    slug: "test",
  }) as ExportedConfig;
  const mod = config.mods?.ios?.[name] as unknown as Mod<T>;
  return (
    await mod({
      modRequest: { modName: name, nextMod: undefined, platform: "ios" },
      modResults: input,
    })
  ).modResults;
}

describe("iOS scene startup", () => {
  it("registers Expo's scene delegate and starts React Native only through it", async () => {
    const plist = await apply("infoPlist", { CFBundleDisplayName: "SMOG Dev" });
    expect(plist).toMatchObject({
      CFBundleDisplayName: "SMOG Dev",
      UIApplicationSceneManifest: {
        UIApplicationSupportsMultipleScenes: false,
        UISceneConfigurations: {
          UIWindowSceneSessionRoleApplication: [
            {
              UISceneDelegateClassName: "EXExpoAppSceneDelegate",
            },
          ],
        },
      },
    });
    const app = await apply("appDelegate", {
      contents: LEGACY_APP,
      language: "swift",
    });
    expect(app.contents).toContain(
      "ExpoAppDelegate, ExpoReactNativeFactoryProvider"
    );
    expect(app.contents).not.toContain("factory.startReactNative(");
    expect(app.contents).toContain(
      "let handled = super.application(app, open: url, options: options)"
    );
    expect(app.contents).toContain(
      "return RCTLinkingManager.application(app, open: url, options: options) || handled"
    );
    expect(await apply("appDelegate", app)).toEqual(app);
  });

  it("fails visibly if a changed template would start React Native twice", async () => {
    await expect(
      apply("appDelegate", {
        contents: LEGACY_APP.replace(
          "window = UIWindow(frame: UIScreen.main.bounds)",
          "window = makeWindow()"
        ),
        language: "swift",
      })
    ).rejects.toThrow("startup template changed");
  });
});
