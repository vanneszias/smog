import { describe, expect, test } from "bun:test";
import { addRecentSearch } from "@smog/local-store";
import { useLocalStoreInstance } from "@smog/local-store/react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useEffect, useState } from "react";
import { renderSite } from "@/test/render";
import { SearchBox, type SearchTrigger } from "./search-box";

const submitted: [string, SearchTrigger][] = [];

function record(query: string, trigger: SearchTrigger): void {
  submitted.push([query, trigger]);
}

function Box(): ReactNode {
  const [value, setValue] = useState("");
  const store = useLocalStoreInstance();
  useEffect(() => {
    store.update(addRecentSearch("kat")).catch(() => undefined);
  }, [store]);
  return (
    <div data-testid="page">
      <SearchBox
        label="Search"
        onSubmit={record}
        onValueChange={setValue}
        value={value}
      />
    </div>
  );
}

describe("SearchBox", () => {
  test("says whether a search was submitted or picked from the recent ones", async () => {
    await renderSite(Box);
    const field = screen.getByRole("searchbox", { name: "Search" });

    act(() => field.focus());
    fireEvent.focus(field);
    fireEvent.click(await screen.findByRole("button", { name: "kat" }));
    await waitFor(() => expect(submitted).toEqual([["kat", "recent_search"]]));

    fireEvent.change(field, { target: { value: "hond " } });
    fireEvent.submit(field.closest("form") as HTMLFormElement);
    expect(submitted).toEqual([
      ["kat", "recent_search"],
      ["hond", "submit"],
    ]);
  });
});
