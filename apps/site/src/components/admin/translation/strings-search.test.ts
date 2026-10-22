import { describe, expect, test } from "bun:test";
import {
  STRINGS_PAGE_SIZE,
  stringsListInput,
  validateStringsSearch,
} from "./strings-search";

describe("the strings table's URL", () => {
  test("keeps what is valid and drops the rest", () => {
    expect(
      validateStringsSearch({
        lang: "pt-BR",
        ns: "auth",
        page: "3",
        q: "  tekst",
        status: "missing",
      })
    ).toEqual({
      lang: "pt-BR",
      ns: "auth",
      page: 3,
      q: "  tekst",
      status: "missing",
    });
    expect(
      validateStringsSearch({
        lang: "NOT A CODE",
        ns: "",
        page: "-1",
        q: "x".repeat(101),
        status: "everything",
      })
    ).toEqual({
      lang: undefined,
      ns: undefined,
      page: undefined,
      q: undefined,
      status: undefined,
    });
    // The first page is no page parameter.
    expect(validateStringsSearch({ page: "1" }).page).toBeUndefined();
  });

  test("turns the filters into the procedure input with the page's offset", () => {
    expect(
      stringsListInput({ lang: "fr", page: 3, q: " tekst ", status: "stale" })
    ).toEqual({
      limit: STRINGS_PAGE_SIZE,
      locale: "fr",
      namespace: undefined,
      offset: 2 * STRINGS_PAGE_SIZE,
      search: "tekst",
      status: "stale",
    });
    expect(stringsListInput({}).offset).toBe(0);
  });
});
