import { describe, expect, mock, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { classesOf, renderKit } from "../test/render";
import {
  DataTable,
  type DataTableColumn,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

describe("Table", () => {
  test("semantic table parts", () => {
    renderKit(
      <Table aria-label="Categories">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Food</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    const table = screen.getByRole("table", { name: "Categories" });
    expect(
      within(table).getByRole("columnheader", { name: "Name" })
    ).toBeDefined();
    expect(within(table).getByRole("cell", { name: "Food" })).toBeDefined();
  });
});

interface Row {
  count: number;
  id: string;
  name: string;
}

const rowId = (row: Row): string => row.id;
const GESTURES = /Gestures/;

const ROWS: Row[] = [
  { count: 12, id: "a", name: "Greetings" },
  { count: 30, id: "b", name: "Food" },
  { count: 7, id: "c", name: "Feelings" },
];

const COLUMNS: DataTableColumn<Row>[] = [
  {
    cell: (row) => row.name,
    header: "Name",
    id: "name",
    sortValue: (row) => row.name,
  },
  {
    align: "end",
    cell: (row) => row.count,
    header: "Gestures",
    id: "count",
    sortValue: (row) => row.count,
  },
];

function names(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");
}

describe("DataTable", () => {
  test("sorts by a column; aria-sort reflects the state", async () => {
    renderKit(
      <DataTable
        aria-label="Categories"
        columns={COLUMNS}
        getRowId={rowId}
        rows={ROWS}
      />
    );
    expect(names()).toEqual(["Greetings", "Food", "Feelings"]);
    const header = screen.getByRole("columnheader", { name: GESTURES });
    expect(header.getAttribute("aria-sort")).toBe("none");
    await userEvent.click(within(header).getByRole("button"));
    expect(header.getAttribute("aria-sort")).toBe("ascending");
    expect(names()).toEqual(["Feelings", "Greetings", "Food"]);
    await userEvent.click(within(header).getByRole("button"));
    expect(header.getAttribute("aria-sort")).toBe("descending");
    expect(names()).toEqual(["Food", "Greetings", "Feelings"]);
  });

  test("sticky header and row click (mouse and keyboard)", async () => {
    const onRowClick = mock();
    renderKit(
      <DataTable
        aria-label="Categories"
        columns={COLUMNS}
        getRowId={rowId}
        onRowClick={onRowClick}
        rows={ROWS}
        stickyHeader
      />
    );
    const head = screen.getAllByRole("rowgroup")[0] ?? null;
    expect(classesOf(head)).toContain("sticky");
    const [, , row] = screen.getAllByRole("row");
    expect(row?.getAttribute("tabindex")).toBe("0");
    expect(classesOf(row ?? null)).toContain("cursor-pointer");
    if (row) {
      await userEvent.click(row);
    }
    expect(onRowClick).toHaveBeenLastCalledWith(ROWS[1]);
    row?.focus();
    await userEvent.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  test("empty rows show the empty slot", () => {
    renderKit(
      <DataTable
        aria-label="Categories"
        columns={COLUMNS}
        empty="No rows"
        getRowId={rowId}
        rows={[]}
      />
    );
    expect(screen.getByRole("cell", { name: "No rows" })).toBeDefined();
  });
});
