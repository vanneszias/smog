import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { shareAsync } from "expo-sharing";
import { shareJsonFile, sweepExportFiles } from "./export-file";

const { mockFiles } = jest.requireMock("expo-file-system") as {
  mockFiles: Map<string, string>;
};

const TODAY = "file:///cache/smog-export-2026-09-30.json";

afterEach(() => {
  mockFiles.clear();
});

describe("shareJsonFile", () => {
  it("iOS: the file is gone once the share sheet closes", async () => {
    let shared: string | undefined;
    (shareAsync as jest.Mock).mockImplementationOnce((path: unknown) => {
      shared = mockFiles.get(path as string);
      return Promise.resolve();
    });
    await shareJsonFile("{}", "smog-export-2026-09-30.json", "Export", "ios");
    expect(shared).toBe("{}");
    expect(mockFiles.has(TODAY)).toBe(false);
  });

  it("Android: the file stays for the receiving app, until the next sweep", async () => {
    mockFiles.set("file:///cache/smog-export-2026-01-01.json", "{}");
    await shareJsonFile(
      "{}",
      "smog-export-2026-09-30.json",
      "Export",
      "android"
    );
    // The share may still be reading it (e.g. a background upload).
    expect(mockFiles.has(TODAY)).toBe(true);
    // An older export never piles up next to it.
    expect(mockFiles.has("file:///cache/smog-export-2026-01-01.json")).toBe(
      false
    );
    sweepExportFiles();
    expect(mockFiles.has(TODAY)).toBe(false);
  });

  it("a failed share still deletes it on iOS", async () => {
    const error = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    (shareAsync as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error("closed"))
    );
    await expect(
      shareJsonFile("{}", "smog-export-2026-09-30.json", "Export", "ios")
    ).rejects.toThrow("closed");
    expect(mockFiles.has(TODAY)).toBe(false);
    error.mockRestore();
  });
});
