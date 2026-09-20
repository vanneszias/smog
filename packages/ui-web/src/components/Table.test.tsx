import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./Table";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

function renderTable(
  props: Partial<{ className: string; caption: string }> = {}
) {
  return render(
    <Table className={props.className}>
      <TableCaption>
        {props.caption ?? "Gebaren in deze categorie"}
      </TableCaption>
      <TableHeader data-testid="kop">
        <TableRow>
          <TableHead>Naam</TableHead>
          <TableHead>Categorie</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow data-testid="rij">
          <TableCell>Hallo</TableCell>
          <TableCell>Begroetingen</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Dank je wel</TableCell>
          <TableCell>Beleefdheid</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

describe("Table", () => {
  it("renders the rows and cells it is given", () => {
    renderTable();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("cell", { name: "Hallo" })).toBeDefined();
  });

  /*
   * The behavioural contract from the plan: a caption is what names a table
   * for a screen reader. Asserted through the accessible name rather than by
   * finding the element, because an element that is present but not
   * associated is the failure this is guarding against.
   */
  it("names the table from its caption", () => {
    renderTable({ caption: "Gebaren in deze categorie" });
    expect(
      screen.getByRole("table", { name: "Gebaren in deze categorie" })
    ).toBeDefined();
  });

  /*
   * HTML requires the caption to be the table's first child, and a screen
   * reader reads it before the rows. Nesting it anywhere else is silently
   * repaired by the parser into something that no longer names the table.
   */
  it("puts the caption first inside the table", () => {
    renderTable();
    const table = screen.getByRole("table");
    expect(table.firstElementChild?.tagName).toBe("CAPTION");
  });

  /*
   * A table with more columns than the viewport has to scroll sideways rather
   * than push the page wide, which is why `Table` renders a container the
   * caller does not have to remember.
   */
  it("wraps the table in a horizontally scrollable container", () => {
    renderTable();
    const parent = screen.getByRole("table").parentElement;
    expect(parent).not.toBeNull();
    expect(classesOf(parent as Element)).toContain("overflow-x-auto");
  });

  it("renders header cells as column headers", () => {
    renderTable();
    const header = screen.getByRole("columnheader", { name: "Naam" });
    expect(header.tagName).toBe("TH");
    expect(header.getAttribute("scope")).toBe("col");
  });

  it("lets a caller scope a header to its row instead", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableHead scope="row">Hallo</TableHead>
            <TableCell>Begroetingen</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByRole("rowheader", { name: "Hallo" })).toBeDefined();
  });

  /*
   * Border roles. The header/body boundary says where the labels stop and the
   * data starts — remove it and a reader loses that — so it is the functional
   * `border`.
   */
  it("separates the header from the body with the functional border", () => {
    renderTable();
    const classes = classesOf(screen.getByTestId("kop"));
    expect(classes).toContain("border-border");
    expect(classes).not.toContain("border-border-subtle");
  });

  /*
   * A rule between two data rows loses nothing when it goes: the rows are
   * still rows. That is decoration, so it is `border-subtle`.
   */
  it("rules the body rows with the decorative border", () => {
    renderTable();
    const classes = classesOf(screen.getByTestId("rij"));
    expect(classes).toContain("border-border-subtle");
    expect(classes).not.toContain("border-border");
  });

  it("lets className override a base class on the table", () => {
    renderTable({ className: "text-sm" });
    const classes = classesOf(screen.getByRole("table"));
    expect(classes).toContain("text-sm");
    expect(classes).not.toContain("text-md");
  });

  it("lets className override a base class on the parts", () => {
    render(
      <Table>
        <TableCaption className="text-lg" data-testid="bijschrift">
          Gebaren
        </TableCaption>
        <TableHeader className="border-b-0" data-testid="kop">
          <TableRow className="bg-red-500" data-testid="koprij">
            <TableHead className="px-6" data-testid="cel">
              Naam
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="align-top" data-testid="lijf">
          <TableRow>
            <TableCell className="px-6" data-testid="datacel">
              Hallo
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(classesOf(screen.getByTestId("bijschrift"))).toContain("text-lg");
    expect(classesOf(screen.getByTestId("bijschrift"))).not.toContain(
      "text-sm"
    );
    expect(classesOf(screen.getByTestId("kop"))).toContain("border-b-0");
    expect(classesOf(screen.getByTestId("kop"))).not.toContain("border-b");
    expect(classesOf(screen.getByTestId("koprij"))).toContain("bg-red-500");
    expect(classesOf(screen.getByTestId("lijf"))).toContain("align-top");
    for (const id of ["cel", "datacel"]) {
      expect(classesOf(screen.getByTestId(id))).toContain("px-6");
      expect(classesOf(screen.getByTestId(id))).not.toContain("px-3");
    }
  });

  it("forwards a ref to the table element", () => {
    const ref = createRef<HTMLTableElement>();
    render(
      <Table ref={ref}>
        <TableBody>
          <TableRow>
            <TableCell>Hallo</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(ref.current).toBeInstanceOf(HTMLTableElement);
  });

  it("forwards refs to the caption, header, body, row and cells", () => {
    const caption = createRef<HTMLTableCaptionElement>();
    const header = createRef<HTMLTableSectionElement>();
    const body = createRef<HTMLTableSectionElement>();
    const row = createRef<HTMLTableRowElement>();
    const head = createRef<HTMLTableCellElement>();
    const cell = createRef<HTMLTableCellElement>();

    render(
      <Table>
        <TableCaption ref={caption}>Gebaren</TableCaption>
        <TableHeader ref={header}>
          <TableRow>
            <TableHead ref={head}>Naam</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody ref={body}>
          <TableRow ref={row}>
            <TableCell ref={cell}>Hallo</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(caption.current).toBeInstanceOf(HTMLTableCaptionElement);
    expect(header.current).toBeInstanceOf(HTMLTableSectionElement);
    expect(body.current).toBeInstanceOf(HTMLTableSectionElement);
    expect(row.current).toBeInstanceOf(HTMLTableRowElement);
    expect(head.current).toBeInstanceOf(HTMLTableCellElement);
    expect(cell.current).toBeInstanceOf(HTMLTableCellElement);
  });

  it("spreads arbitrary props onto the table", () => {
    render(
      <Table data-testid="tabel" lang="nl">
        <TableBody>
          <TableRow>
            <TableCell>Hallo</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByTestId("tabel").getAttribute("lang")).toBe("nl");
    expect(screen.getByTestId("tabel")).toBe(screen.getByRole("table"));
  });
});
