import { describe, expect, it } from "@jest/globals";

type Source =
  | { filePath: string; type: "file" }
  | { id: string; type: "contents" };
const { fileHookTransform } =
  require("../../../../../apps/mobile/fingerprint.config.cjs") as {
    fileHookTransform: (
      source: Source,
      chunk: Buffer | string | null,
      end: boolean,
      encoding: BufferEncoding
    ) => Buffer | string | null;
  };
const source: Source = {
  filePath:
    "../../node_modules/@react-native-masked-view/masked-view/android/src/main/AndroidManifest.xml",
  type: "file",
};
const pristine =
  '<manifest package="org.reactnative.maskedview" xmlns:android="http://schemas.android.com/apk/res/android">\n</manifest>\n';
const built = pristine.replace('package="org.reactnative.maskedview"', "");

function transform(text: string): string {
  // Deliberately split inside the attribute: the hook receives stream chunks.
  expect(
    fileHookTransform(source, Buffer.from(text.slice(0, 25)), false, "utf8")
  ).toBeNull();
  expect(
    fileHookTransform(source, Buffer.from(text.slice(25)), false, "utf8")
  ).toBeNull();
  return fileHookTransform(source, null, true, "utf8") as string;
}

describe("native runtime fingerprint", () => {
  it("is stable before and after masked-view's Gradle manifest rewrite", () => {
    expect(transform(pristine)).toBe(transform(built));
  });

  it("still detects real manifest changes", () => {
    expect(
      transform(
        pristine.replace("</manifest>", "<uses-permission /></manifest>")
      )
    ).not.toBe(transform(pristine));
  });

  it("passes unrelated files and config contents through untouched", () => {
    for (const other of [
      { ...source, filePath: "android/app/src/main/AndroidManifest.xml" },
      { id: "expoConfig", type: "contents" },
    ] as const) {
      expect(fileHookTransform(other, pristine, true, "utf8")).toBe(pristine);
    }
  });
});
