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

    // Add removal directives for each permission
    // This tells the Android manifest merger to remove these permissions
    // even if they're declared in library manifests
    for (const permission of permissionsToRemove) {
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
