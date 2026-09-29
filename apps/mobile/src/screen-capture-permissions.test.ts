import { describe, expect, it } from "@jest/globals";
import type { AndroidManifest, ExportedConfig } from "expo/config-plugins";
import withScreenCapturePermissions from "../plugins/with-screen-capture-permissions";

type ManifestMod = (config: {
  modResults: AndroidManifest;
  modRequest: Record<string, unknown>;
}) => Promise<{ modResults: AndroidManifest }>;

async function applyPlugin(
  manifest: AndroidManifest
): Promise<AndroidManifest> {
  const config = withScreenCapturePermissions({
    name: "test",
    slug: "test",
  }) as ExportedConfig;
  const mod = config.mods?.android?.manifest as unknown as ManifestMod;
  const result = await mod({
    modRequest: {
      modName: "manifest",
      nextMod: undefined,
      platform: "android",
    },
    modResults: manifest,
  });
  return result.modResults;
}

describe("withScreenCapturePermissions", () => {
  it("marks the media read permissions for removal, once each", async () => {
    const manifest = await applyPlugin({
      manifest: {
        $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
        "uses-permission": [
          { $: { "android:name": "android.permission.INTERNET" } },
          { $: { "android:name": "android.permission.READ_MEDIA_IMAGES" } },
        ],
      },
    } as AndroidManifest);

    expect(manifest.manifest.$["xmlns:tools"]).toBe(
      "http://schemas.android.com/tools"
    );
    expect(manifest.manifest["uses-permission"]).toEqual([
      { $: { "android:name": "android.permission.INTERNET" } },
      ...[
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.READ_EXTERNAL_STORAGE",
      ].map((name) => ({
        $: { "android:name": name, "tools:node": "remove" },
      })),
    ]);
  });
});
