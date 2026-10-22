import { describe, expect, test } from "bun:test";
import { LEGAL_KINDS, legalDocument, validateLegalDocument } from "./index";

const consent = { consentControl: true } as const;

function doc(blocks: unknown[], extra: Record<string, unknown> = {}) {
  return {
    sections: [{ blocks, id: "a", title: "A", ...extra }],
    title: "T",
  };
}

function codes(kind: "privacy" | "terms", value: unknown): string[] {
  return validateLegalDocument(kind, value).issues.map((issue) => issue.code);
}

describe("validateLegalDocument", () => {
  test("accepts every shipped text", () => {
    for (const locale of ["nl", "en", "fr"]) {
      for (const kind of LEGAL_KINDS) {
        const result = validateLegalDocument(kind, legalDocument(locale, kind));
        expect(result.issues).toEqual([]);
      }
    }
  });

  test("accepts paragraphs, lists, lines, bold, https, mailto and in-site links", () => {
    expect(
      codes(
        "terms",
        doc([
          "Plain **bold** [a](https://example.test/x) [b](mailto:a@example.test) [c](/privacy#data)",
          { list: ["one", "two"] },
          { lines: ["Street 1", "City"] },
        ])
      )
    ).toEqual([]);
  });

  test("refuses a link that is not https, mailto or in-site", () => {
    for (const href of [
      "http://example.test",
      "javascript:alert(1)",
      "//evil.test",
      "data:text/html,x",
    ]) {
      expect(codes("terms", doc([`See [here](${href}) now`]))).toContain(
        "unsafeLink"
      );
    }
  });

  test("refuses unsafe links inside lists too", () => {
    expect(
      codes("terms", doc([{ list: ["ok", "[x](ftp://a.test/b)"] }]))
    ).toContain("unsafeLink");
  });

  test("refuses raw HTML", () => {
    expect(codes("terms", doc(["Hello <script>alert(1)</script>"]))).toContain(
      "html"
    );
  });

  test("refuses a bad shape, empty text, duplicate or malformed section ids", () => {
    expect(codes("terms", { title: "x" })[0]).toBe("shape");
    expect(codes("terms", doc([""]))).toContain("empty");
    const twice = {
      sections: [
        { blocks: ["a"], id: "same", title: "A" },
        { blocks: ["b"], id: "same", title: "B" },
      ],
      title: "T",
    };
    expect(codes("terms", twice)).toContain("duplicateId");
    expect(codes("terms", doc(["a"], { id: "Bad Id" }))).toContain("badId");
  });

  test("a privacy text keeps exactly one consent control, a terms text has none", () => {
    expect(codes("privacy", doc(["a"]))).toContain("consentControl");
    expect(codes("privacy", doc([consent, consent]))).toContain(
      "consentControl"
    );
    expect(codes("privacy", doc([consent]))).toEqual([]);
    expect(codes("terms", doc([consent]))).toContain("consentControl");
  });

  test("returns the parsed document without extra keys", () => {
    const result = validateLegalDocument("terms", { ...doc(["a"]), extra: 1 });
    expect(result.document).toEqual(doc(["a"]));
  });
});
