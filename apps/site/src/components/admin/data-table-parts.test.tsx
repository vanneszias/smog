import { beforeEach, describe, expect, test } from "bun:test";
import { DataTable, type DataTableColumn } from "@smog/ui-web";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { renderSite } from "@/test/render";
import {
  ColumnsMenu,
  RowActions,
  useColumnVisibility,
} from "./data-table-parts";

/*
 * The data-table pattern's parts over a small table: the column visibility
 * menu (pinned columns stay, the choice survives a reload) and the row
 * actions menu (opens the row and does not also fire the row's click).
 */

interface Row {
  id: string;
  name: string;
  note: string;
}

const ROWS: Row[] = [{ id: "r1", name: "Hond", note: "Een dier" }];
const PINNED = ["name", "actions"] as const;

function rowId(row: Row): string {
  return row.id;
}

function Harness(): ReactNode {
  const [opened, setOpened] = useState<string[]>([]);
  const [rowClicks, setRowClicks] = useState(0);
  const open = useCallback(
    (row: Row) => setOpened((current) => [...current, row.id]),
    []
  );
  const click = useCallback(() => setRowClicks((count) => count + 1), []);
  const all = useMemo<DataTableColumn<Row>[]>(
    () => [
      { cell: (row) => row.name, header: "Name", id: "name" },
      { cell: (row) => row.note, header: "Note", id: "note" },
      {
        cell: (row) => <RowActions name={row.name} onOpen={open} row={row} />,
        header: <span className="sr-only">Actions</span>,
        id: "actions",
      },
    ],
    [open]
  );
  const visibility = useColumnVisibility("test", all, PINNED);
  return (
    <div data-testid="page">
      <ColumnsMenu all={all} pinned={PINNED} visibility={visibility} />
      <DataTable
        aria-label="Rows"
        columns={visibility.columns}
        getRowId={rowId}
        onRowClick={click}
        rows={ROWS}
      />
      <output data-testid="opened">{opened.join(",")}</output>
      <output data-testid="clicks">{rowClicks}</output>
    </div>
  );
}

function page(): ReactNode {
  return <Harness />;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("ColumnsMenu", () => {
  test("hides a column, keeps the pinned ones and remembers the choice", async () => {
    await renderSite(page);
    const table = await screen.findByRole("table", { name: "Rows" });
    expect(within(table).getByText("Een dier")).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "Columns" }));
    const menu = await screen.findByRole("menu");
    // The name and the actions cannot be hidden: only the note is offered.
    const items = within(menu).getAllByRole("menuitemcheckbox");
    expect(items.map((item) => item.textContent)).toEqual(["Note"]);
    expect(items[0]?.getAttribute("aria-checked")).toBe("true");

    await userEvent.click(items[0] as HTMLElement);
    expect(within(table).queryByText("Een dier")).toBeNull();
    expect(items[0]?.getAttribute("aria-checked")).toBe("false");
    expect(window.localStorage.getItem("smog.admin.columns.test")).toBe(
      '["note"]'
    );

    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Show all columns" })
    );
    expect(within(table).getByText("Een dier")).toBeDefined();
    expect(window.localStorage.getItem("smog.admin.columns.test")).toBeNull();
  });

  test("reads the stored choice after hydration", async () => {
    window.localStorage.setItem("smog.admin.columns.test", '["note"]');
    await renderSite(page);
    const table = await screen.findByRole("table", { name: "Rows" });
    await screen.findByText("Hond");
    expect(within(table).queryByText("Een dier")).toBeNull();
  });
});

describe("RowActions", () => {
  test("opens the row from the menu without a row click", async () => {
    await renderSite(page);
    await userEvent.click(
      await screen.findByRole("button", { name: "Actions for Hond" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Open" })
    );
    expect(screen.getByTestId("opened").textContent).toBe("r1");
    expect(screen.getByTestId("clicks").textContent).toBe("0");
  });
});
