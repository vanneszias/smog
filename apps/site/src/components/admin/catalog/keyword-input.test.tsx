import { describe, expect, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { type ReactNode, useCallback, useState } from "react";
import { renderSite } from "@/test/render";
import { KeywordInput } from "./keyword-input";

/*
 * The keyword input's rules (A-16): Enter or Add, trimmed, de-duplicated
 * with normalizeText equality, at most 30 of at most 60 characters, and a
 * click on a keyword removes it.
 */

const REMOVE = /Remove/;

let last: string[] = [];

function Harness({ initial = [] }: { initial?: string[] }): ReactNode {
  const [value, setValue] = useState(initial);
  const onChange = useCallback((next: string[]) => {
    last = next;
    setValue(next);
  }, []);
  return (
    <div data-testid="page">
      <KeywordInput label="Keywords" onChange={onChange} value={value} />
    </div>
  );
}

function input(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "Keywords" }) as HTMLInputElement;
}

function type(text: string): void {
  fireEvent.change(input(), { target: { value: text } });
}

describe("KeywordInput", () => {
  test("adds a trimmed keyword with Enter or Add, and clears the input", async () => {
    await renderSite(() => <Harness />);
    type("  koffie  ");
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(last).toEqual(["koffie"]);
    expect(input().value).toBe("");
    type("thee");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(last).toEqual(["koffie", "thee"]);
  });

  test("refuses a duplicate by normalizeText, keeping the first spelling", async () => {
    await renderSite(() => <Harness initial={["Café"]} />);
    type("cafe");
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(screen.getByText("“cafe” is already a keyword.")).toBeDefined();
    expect(screen.getAllByRole("button", { name: REMOVE })).toHaveLength(1);
    // The text stays, so it can be corrected.
    expect(input().value).toBe("cafe");
  });

  test("refuses a keyword over 60 characters and a 31st keyword", async () => {
    last = [];
    await renderSite(() => (
      <Harness
        initial={Array.from({ length: 30 }, (_, index) => `woord ${index}`)}
      />
    ));
    type("x".repeat(61));
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(
      screen.getByText("A keyword has at most 60 characters.")
    ).toBeDefined();
    type("nog een");
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(screen.getByText("At most 30 keywords.")).toBeDefined();
    expect(last).toEqual([]);
  });

  test("ignores an empty entry, and removes a keyword on click", async () => {
    await renderSite(() => <Harness initial={["hond", "kat"]} />);
    type("   ");
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove hond" }));
    expect(last).toEqual(["kat"]);
    // The focus moves on to the next keyword, then to the input (M9).
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Remove kat"
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove kat" }));
    expect(document.activeElement).toBe(input());
  });
});
