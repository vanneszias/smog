const { withAndroidManifest } = require("expo/config-plugins");

/**
 * Expo config plugin that removes READ_MEDIA_IMAGES and READ_EXTERNAL_STORAGE
 * permissions from expo-screen-capture.
 *
 * This allows the app to pass Google Play review while still supporting
 * screenshot detection on Android 14+ via DETECT_SCREEN_CAPTURE permission.
 *
 * On Android 13 and below, screenshot detection will silently fail.
 */
const withScreenCapturePermissions = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;

    // Ensure tools namespace is present
    if (!androidManifest.manifest.$) {
      androidManifest.manifest.$ = {};
    }
    androidManifest.manifest.$["xmlns:tools"] =
      "http://schemas.android.com/tools";

    // Initialize uses-permission array if it doesn't exist
    if (!androidManifest.manifest["uses-permission"]) {
      androidManifest.manifest["uses-permission"] = [];
    }

    // Permissions to remove from expo-screen-capture
    const permissionsToRemove = [
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VIDEO",
      "android.permission.READ_EXTERNAL_STORAGE",
    ];

    for (const permission of permissionsToRemove) {
      // Remove any existing entries for this permission (added by other plugins)
      // to avoid duplicate entries that fail the manifest merger.
      androidManifest.manifest["uses-permission"] = androidManifest.manifest[
        "uses-permission"
      ].filter((p) => p.$?.["android:name"] !== permission);

      // Add a single tools:node="remove" directive so the merger removes it
      // from any library manifests (e.g. expo-screen-capture's AAR) as well.
      androidManifest.manifest["uses-permission"].push({
        $: {
          "android:name": permission,
          "tools:node": "remove",
        },
      });
    }

    return config;
  });
};

module.exports = withScreenCapturePermissions;
