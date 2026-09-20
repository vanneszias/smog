import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import "../test/jsdomShims";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

function renderTabs(
  props: Partial<{
    onValueChange: (value: string) => void;
    listClassName: string;
    triggerClassName: string;
    contentClassName: string;
    disabled: boolean;
  }> = {}
) {
  return render(
    <Tabs defaultValue="gebaren" onValueChange={props.onValueChange}>
      <TabsList className={props.listClassName}>
        <TabsTrigger className={props.triggerClassName} value="gebaren">
          Gebaren
        </TabsTrigger>
        <TabsTrigger value="categorieen">Categorieën</TabsTrigger>
        <TabsTrigger disabled={props.disabled} value="lijsten">
          Lijsten
        </TabsTrigger>
      </TabsList>
      <TabsContent className={props.contentClassName} value="gebaren">
        Alle gebaren
      </TabsContent>
      <TabsContent value="categorieen">Alle categorieën</TabsContent>
      <TabsContent value="lijsten">Alle lijsten</TabsContent>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("renders a tablist with one tab per trigger", () => {
    renderTabs();
    expect(screen.getByRole("tablist")).toBeDefined();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("shows only the selected panel", () => {
    renderTabs();
    expect(screen.getByRole("tabpanel").textContent).toBe("Alle gebaren");
    expect(screen.queryByText("Alle categorieën")).toBeNull();
  });

  it("marks the selected tab as selected", () => {
    renderTabs();
    expect(
      screen.getByRole("tab", { name: "Gebaren" }).getAttribute("aria-selected")
    ).toBe("true");
    expect(
      screen
        .getByRole("tab", { name: "Categorieën" })
        .getAttribute("aria-selected")
    ).toBe("false");
  });

  /*
   * `aria-selected` tells a screen reader which tab is current; nothing tells
   * a sighted user unless the selected trigger also *looks* different. Both
   * halves are asserted — the state Radix sets and the style hook that reads
   * it — because dropping the second leaves every other test in this file
   * passing. (It survived as a mutation until this test existed.)
   */
  it("marks the selected tab visually, not only in aria", () => {
    renderTabs();
    const selected = screen.getByRole("tab", { name: "Gebaren" });
    const other = screen.getByRole("tab", { name: "Categorieën" });

    expect(selected.getAttribute("data-state")).toBe("active");
    expect(other.getAttribute("data-state")).toBe("inactive");

    const classes = classesOf(selected);
    expect(classes).toContain("data-[state=active]:bg-surface-raised");
    expect(classes).toContain("data-[state=active]:text-foreground");
  });

  it("switches panels on click and reports the new value", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderTabs({ onValueChange });

    await user.click(screen.getByRole("tab", { name: "Categorieën" }));

    expect(onValueChange).toHaveBeenCalledWith("categorieen");
    expect(screen.getByRole("tabpanel").textContent).toBe("Alle categorieën");
  });

  /*
   * A tablist is a single tab stop with arrow-key navigation inside it; a
   * strip of buttons you have to Tab through is a different widget wearing
   * the same clothes, and a click-only test cannot tell them apart.
   */
  it("switches panels with the arrow keys", async () => {
    const user = userEvent.setup();
    renderTabs();

    screen.getByRole("tab", { name: "Gebaren" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Categorieën" })
    );
    expect(screen.getByRole("tabpanel").textContent).toBe("Alle categorieën");
  });

  it("walks back with the left arrow key", async () => {
    const user = userEvent.setup();
    renderTabs();

    screen.getByRole("tab", { name: "Gebaren" }).focus();
    await user.keyboard("{ArrowRight}{ArrowLeft}");

    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Gebaren" })
    );
    expect(screen.getByRole("tabpanel").textContent).toBe("Alle gebaren");
  });

  it("holds the whole tablist in a single tab stop", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Gebaren" })
    );

    await user.tab();
    expect(document.activeElement).not.toBe(
      screen.getByRole("tab", { name: "Categorieën" })
    );
  });

  it("skips a disabled tab", async () => {
    const user = userEvent.setup();
    renderTabs({ disabled: true });

    await user.click(screen.getByRole("tab", { name: "Lijsten" }));

    expect(screen.getByRole("tabpanel").textContent).toBe("Alle gebaren");
  });

  it("lets className override a base class on the list, a trigger and a panel", () => {
    renderTabs({
      listClassName: "bg-red-500",
      triggerClassName: "px-6",
      contentClassName: "pt-6",
    });

    const list = classesOf(screen.getByRole("tablist"));
    expect(list).toContain("bg-red-500");
    expect(list).not.toContain("bg-surface");

    const trigger = classesOf(screen.getByRole("tab", { name: "Gebaren" }));
    expect(trigger).toContain("px-6");
    expect(trigger).not.toContain("px-3");

    const panel = classesOf(screen.getByRole("tabpanel"));
    expect(panel).toContain("pt-6");
    expect(panel).not.toContain("pt-4");
  });

  it("forwards refs to the root, list, trigger and content", () => {
    const root = createRef<HTMLDivElement>();
    const list = createRef<HTMLDivElement>();
    const trigger = createRef<HTMLButtonElement>();
    const content = createRef<HTMLDivElement>();

    render(
      <Tabs defaultValue="gebaren" ref={root}>
        <TabsList ref={list}>
          <TabsTrigger ref={trigger} value="gebaren">
            Gebaren
          </TabsTrigger>
        </TabsList>
        <TabsContent ref={content} value="gebaren">
          Alle gebaren
        </TabsContent>
      </Tabs>
    );

    expect(root.current).toBeInstanceOf(HTMLDivElement);
    expect(list.current).toBe(screen.getByRole("tablist"));
    expect(trigger.current).toBe(screen.getByRole("tab"));
    expect(content.current).toBe(screen.getByRole("tabpanel"));
  });

  it("spreads arbitrary props onto the list, trigger and content", () => {
    render(
      <Tabs defaultValue="gebaren">
        <TabsList data-testid="lijst">
          <TabsTrigger data-testid="tab" value="gebaren">
            Gebaren
          </TabsTrigger>
        </TabsList>
        <TabsContent data-testid="paneel" value="gebaren">
          Alle gebaren
        </TabsContent>
      </Tabs>
    );

    expect(screen.getByTestId("lijst")).toBe(screen.getByRole("tablist"));
    expect(screen.getByTestId("tab")).toBe(screen.getByRole("tab"));
    expect(screen.getByTestId("paneel")).toBe(screen.getByRole("tabpanel"));
  });

  it("names each panel from the tab that controls it", () => {
    renderTabs();
    expect(screen.getByRole("tabpanel", { name: "Gebaren" })).toBeDefined();
  });
});
