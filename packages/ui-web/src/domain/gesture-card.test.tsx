import { describe, expect, mock, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { EAT, HELLO } from "../test/gestures";
import { classesOf, renderKit } from "../test/render";
import { GestureCard } from "./gesture-card";
import { GestureGrid } from "./gesture-grid";
import { GestureRow } from "./gesture-row";
import type { GestureCardData } from "./types";

function linkedCard(gesture: GestureCardData): ReactNode {
  return <GestureCard gesture={gesture} href={`/gestures/${gesture.slug}`} />;
}

describe("GestureCard", () => {
  test("the name links to the gesture and the categories follow", () => {
    const { container } = renderKit(
      <GestureCard gesture={HELLO} href="/gestures/hello" />
    );
    const link = screen.getByRole("link", { name: "Hello" });
    expect(link.getAttribute("href")).toBe("/gestures/hello");
    // The link stretches over the whole card (one tab stop, a big target).
    expect(classesOf(link)).toContain("after:inset-0");
    expect(screen.getByRole("heading", { name: "Hello" })).toBeDefined();
    expect(screen.getByText("Greetings, Everyday")).toBeDefined();
    const image = container.querySelector("img");
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.getAttribute("loading")).toBe("lazy");
    expect(image?.getAttribute("src")).toStartWith(
      "https://image.mux.com/mux-hello/thumbnail.webp"
    );
    expect(classesOf(image?.parentElement ?? null)).toContain("aspect-3/4");
  });

  test("the favorite toggle sits beside the link, not inside it", async () => {
    const onFavoriteToggle = mock();
    renderKit(
      <GestureCard
        favorite={false}
        gesture={HELLO}
        href="/gestures/hello"
        onFavoriteToggle={onFavoriteToggle}
      />
    );
    const toggle = screen.getByRole("button", { name: "Favorite" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.closest("a")).toBeNull();
    await userEvent.click(toggle);
    expect(onFavoriteToggle).toHaveBeenCalledWith(true);
  });

  test("no toggle without onFavoriteToggle; a sponsored badge when sponsored", () => {
    renderKit(<GestureCard gesture={HELLO} sponsored />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Sponsored")).toBeDefined();
  });

  test("linkComponent renders the app's router link", () => {
    function RouterLink({
      children,
      className,
      href,
    }: {
      children?: ReactNode;
      className?: string;
      href: string;
    }): ReactNode {
      return (
        <a className={className} data-router="yes" href={href}>
          {children}
        </a>
      );
    }
    renderKit(
      <GestureCard gesture={HELLO} href="/x" linkComponent={RouterLink} />
    );
    const link = screen.getByRole("link", { name: "Hello" });
    expect(link.getAttribute("data-router")).toBe("yes");
    expect(classesOf(link)).toContain("after:inset-0");
  });
});

describe("GestureRow", () => {
  test("a dense row with a drag handle slot first and the toggle last", async () => {
    const onFavoriteToggle = mock();
    const { container } = renderKit(
      <GestureRow
        dragHandle={<button type="button">Drag</button>}
        favorite
        gesture={EAT}
        href="/gestures/eat"
        onFavoriteToggle={onFavoriteToggle}
      />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]?.textContent).toBe("Drag");
    expect(buttons.at(-1)?.getAttribute("aria-label")).toBe("Favorite");
    expect(buttons.at(-1)?.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("link", { name: "Eat" }).getAttribute("href")).toBe(
      "/gestures/eat"
    );
    expect(screen.getByText("Food")).toBeDefined();
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
    await userEvent.click(screen.getByRole("button", { name: "Favorite" }));
    expect(onFavoriteToggle).toHaveBeenCalledWith(false);
  });
});

describe("GestureGrid", () => {
  test("a list of cards, one item per gesture", () => {
    renderKit(<GestureGrid aria-label="Results" items={[HELLO, EAT]} />);
    const list = screen.getByRole("list", { name: "Results" });
    expect(classesOf(list)).toContain("grid");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText("Hello")).toBeDefined();
  });

  test("renderItem replaces the default card", () => {
    renderKit(<GestureGrid items={[HELLO, EAT]} renderItem={linkedCard} />);
    expect(screen.getByRole("link", { name: "Eat" }).getAttribute("href")).toBe(
      "/gestures/eat"
    );
  });
});
