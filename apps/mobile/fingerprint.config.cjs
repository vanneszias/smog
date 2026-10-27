"use strict";
// masked-view 0.3.2's Gradle script removes this obsolete package attribute
// in-place. Hash the same manifest before and after an Android build, including
// when the next EAS build or OTA update targets iOS. Keep all other content.
let manifest = "";
const MANIFEST_SPACING = /<manifest\s+/;

/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  fileHookTransform(source, chunk, isEndOfFile) {
    if (
      source.type !== "file" ||
      !source.filePath.endsWith(
        "/@react-native-masked-view/masked-view/android/src/main/AndroidManifest.xml"
      )
    ) {
      return chunk;
    }
    if (chunk !== null) {
      manifest += chunk.toString();
    }
    if (!isEndOfFile) {
      return null;
    }
    const normalized = manifest
      .replace('package="org.reactnative.maskedview"', "")
      .replace(MANIFEST_SPACING, "<manifest ");
    manifest = "";
    return normalized;
  },
};
