const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const LEGACY_WINDOW =
  /#if os\(iOS\) \|\| os\(tvOS\)\s+window = UIWindow\(frame: UIScreen\.main\.bounds\)[\s\S]*?#endif/;

/** SDK 57 supplies the scene delegate, but its prebuild template still starts a legacy window. */
module.exports = (config) => {
  const scenes = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "EXExpoAppSceneDelegate",
          },
        ],
      },
    };
    return mod;
  });
  return withAppDelegate(scenes, (mod) => {
    let { contents } = mod.modResults;
    if (mod.modResults.language !== "swift") {
      throw new Error("[ios-scenes] Expected Expo's Swift AppDelegate.");
    }
    contents = contents.replace(LEGACY_WINDOW, "");
    if (contents.includes("factory.startReactNative(")) {
      throw new Error(
        "[ios-scenes] Expo's startup template changed; review scene startup."
      );
    }
    contents = contents.replace(
      "class AppDelegate: ExpoAppDelegate {",
      "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {"
    );
    // Expo's subscribers may consume a warm URL; React Native must still receive it.
    contents = contents.replace(
      "return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)",
      "let handled = super.application(app, open: url, options: options)\n    return RCTLinkingManager.application(app, open: url, options: options) || handled"
    );
    if (!contents.includes("ExpoReactNativeFactoryProvider")) {
      throw new Error(
        "[ios-scenes] Could not register Expo's React Native factory provider."
      );
    }
    mod.modResults.contents = contents;
    return mod;
  });
};
