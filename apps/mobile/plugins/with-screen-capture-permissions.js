const { withAndroidManifest } = require("expo/config-plugins");

/**
 * Strips the media read permissions that `expo-screen-capture` declares, so
 * the app passes Google Play review. Screenshot detection keeps working on
 * Android 14+ through `DETECT_SCREEN_CAPTURE`; on Android 13 and below it
 * silently does nothing.
 */
const REMOVED_PERMISSIONS = [
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_EXTERNAL_STORAGE",
];

const withScreenCapturePermissions = (config) =>
  withAndroidManifest(config, (modConfig) => {
    const { manifest } = modConfig.modResults;
    manifest.$ = {
      ...manifest.$,
      "xmlns:tools": "http://schemas.android.com/tools",
    };

    // Drop entries added by other plugins first: a duplicate permission next
    // to the `tools:node="remove"` directive fails the manifest merger.
    const kept = (manifest["uses-permission"] ?? []).filter(
      (permission) =>
        !REMOVED_PERMISSIONS.includes(permission.$?.["android:name"])
    );
    manifest["uses-permission"] = [
      ...kept,
      // The merger then removes them from library manifests (the AARs) too.
      ...REMOVED_PERMISSIONS.map((name) => ({
        $: { "android:name": name, "tools:node": "remove" },
      })),
    ];

    return modConfig;
  });

module.exports = withScreenCapturePermissions;
