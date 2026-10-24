import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { sweepExportFiles } from "./export-file";
import {
  fetchLessonPdf,
  LessonPdfError,
  lessonPdfFileName,
  shareLessonPdf,
} from "./lesson-file";

const { mockFiles } = jest.requireMock("expo-file-system") as {
  mockFiles: Map<string, string>;
};

const PDF = "file:///cache/les-1234abcd-teachers-nl.pdf";
const bytes = new TextEncoder().encode("%PDF-1.7");

afterEach(() => {
  mockFiles.clear();
});

function reply(response: Response): typeof fetch {
  return jest.fn(() => Promise.resolve(response)) as unknown as typeof fetch;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof LessonPdfError ? error.code : "other";
  }
  return "none";
}

describe("lesson PDF names", () => {
  it("builds the route path and a file name that is safe in the cache", () => {
    expect(
      lessonPdfFileName(
        "1234abcd-0000-4000-8000-000000000000",
        "teachers",
        "nl"
      )
    ).toBe("les-1234abcd-teachers-nl.pdf");
    expect(lessonPdfFileName("../../x", "teachers", "n/l")).toBe(
      "les-x-teachers-nl.pdf"
    );
  });
});

describe("fetchLessonPdf", () => {
  it("sends the session cookie by hand and returns the bytes", async () => {
    const fetchImpl = reply(new Response(bytes, { status: 200 }));
    const result = await fetchLessonPdf({
      cookie: "smog.session_token=t",
      fetchImpl,
      url: "https://smog.test/api/teacher/lessons/l1/pdf?template=teachers&locale=nl",
    });
    expect(new TextDecoder().decode(result)).toBe("%PDF-1.7");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://smog.test/api/teacher/lessons/l1/pdf?template=teachers&locale=nl",
      { credentials: "omit", headers: { cookie: "smog.session_token=t" } }
    );
  });

  it.each([
    [422, "TOO_MANY"],
    [422, "TOO_LARGE"],
    [504, "TIMEOUT"],
    [429, "RATE_LIMITED"],
  ])("maps the typed body of a %i to %s", async (status, code) => {
    const fetchImpl = reply(Response.json({ code }, { status }));
    expect(
      await codeOf(fetchLessonPdf({ cookie: "c", fetchImpl, url: "u" }))
    ).toBe(code);
  });

  it.each([
    [401, "UNAUTHORIZED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [429, "RATE_LIMITED"],
    [500, "FAILED"],
  ])("maps a body-less %i to %s", async (status, code) => {
    const fetchImpl = reply(new Response("<html>", { status }));
    expect(
      await codeOf(fetchLessonPdf({ cookie: "c", fetchImpl, url: "u" }))
    ).toBe(code);
  });

  it("a request that never arrives is OFFLINE", async () => {
    const error = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fetchImpl = jest.fn(() =>
      Promise.reject(new TypeError("Network request failed"))
    ) as unknown as typeof fetch;
    expect(
      await codeOf(fetchLessonPdf({ cookie: "c", fetchImpl, url: "u" }))
    ).toBe("OFFLINE");
    error.mockRestore();
  });
});

describe("shareLessonPdf", () => {
  it("iOS: the file is shared as a PDF and gone once the sheet closes", async () => {
    let shared: string | undefined;
    (shareAsync as jest.Mock).mockImplementationOnce((path: unknown) => {
      shared = mockFiles.get(path as string);
      return Promise.resolve();
    });
    await shareLessonPdf(bytes, "les-1234abcd-teachers-nl.pdf", "Les", "ios");
    expect(shared).toBe("%PDF-1.7");
    expect(shareAsync).toHaveBeenCalledWith(PDF, {
      dialogTitle: "Les",
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
    });
    expect(mockFiles.has(PDF)).toBe(false);
  });

  it("Android: the file stays for the receiving app until the next sweep", async () => {
    mockFiles.set("file:///cache/les-old00000-teachers-nl.pdf", "old");
    mockFiles.set("file:///cache/other.txt", "keep");
    await shareLessonPdf(
      bytes,
      "les-1234abcd-teachers-nl.pdf",
      "Les",
      "android"
    );
    expect(mockFiles.has(PDF)).toBe(true);
    expect(mockFiles.has("file:///cache/les-old00000-teachers-nl.pdf")).toBe(
      false
    );
    sweepExportFiles();
    expect(mockFiles.has(PDF)).toBe(false);
    expect(mockFiles.has("file:///cache/other.txt")).toBe(true);
  });

  it("a device with no share sheet gets SHARING_UNAVAILABLE and nothing is written", async () => {
    (isAvailableAsync as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve(false)
    );
    expect(
      await codeOf(
        shareLessonPdf(bytes, "les-1234abcd-teachers-nl.pdf", "Les", "ios")
      )
    ).toBe("SHARING_UNAVAILABLE");
    expect(mockFiles.size).toBe(0);
    expect(shareAsync).not.toHaveBeenCalled();
  });

  it("a failed share still deletes the file on iOS and rethrows", async () => {
    const error = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    (shareAsync as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error("closed"))
    );
    await expect(
      shareLessonPdf(bytes, "les-1234abcd-teachers-nl.pdf", "Les", "ios")
    ).rejects.toThrow("closed");
    expect(mockFiles.has(PDF)).toBe(false);
    error.mockRestore();
  });
});
