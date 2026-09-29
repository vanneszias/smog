import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { classesOf, renderKit } from "../test/render";
import { Button } from "./button";

describe("Button", () => {
  test("is a button named by its children, primary md by default", () => {
    renderKit(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(classesOf(button)).toContain("bg-primary");
    expect(classesOf(button)).toContain("min-h-touch");
    expect(classesOf(button)).toContain("focus-visible:ring-focus-ring");
    expect(button.getAttribute("type")).toBe("button");
  });

  test("variants and sizes", () => {
    renderKit(
      <>
        <Button variant="secondary">a</Button>
        <Button variant="ghost">b</Button>
        <Button size="lg" variant="danger">
          c
        </Button>
        <Button size="sm">d</Button>
      </>
    );
    expect(classesOf(screen.getByRole("button", { name: "a" }))).toContain(
      "border-foreground-muted"
    );
    expect(classesOf(screen.getByRole("button", { name: "b" }))).toContain(
      "bg-transparent"
    );
    const danger = classesOf(screen.getByRole("button", { name: "c" }));
    expect(danger).toContain("bg-danger");
    expect(danger).toContain("min-h-12");
    const small = classesOf(screen.getByRole("button", { name: "d" }));
    expect(small).toContain("min-h-8");
    // sm keeps a 44 px hit area through a pseudo-element.
    expect(small).toContain("after:size-touch");
  });

  test("loading marks it busy, disables it and keeps the name", async () => {
    const onClick = mock();
    renderKit(
      <Button loading onClick={onClick}>
        Save
      </Button>
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(true);
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  test("className comes last and wins", () => {
    renderKit(<Button className="bg-accent">x</Button>);
    const classes = classesOf(screen.getByRole("button"));
    expect(classes).toContain("bg-accent");
    expect(classes).not.toContain("bg-primary");
  });

  test("forwards the ref and renders a link with asChild", () => {
    const ref = createRef<HTMLButtonElement>();
    renderKit(
      <>
        <Button ref={ref}>x</Button>
        <Button asChild>
          <a href="/gestures">Gestures</a>
        </Button>
      </>
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    const link = screen.getByRole("link", { name: "Gestures" });
    expect(link.getAttribute("type")).toBeNull();
    expect(classesOf(link)).toContain("bg-primary");
  });

  test("an icon is decorative", () => {
    renderKit(<Button icon={<svg data-testid="icon" />}>Share</Button>);
    expect(screen.getByRole("button", { name: "Share" })).toBeDefined();
    expect(
      screen.getByTestId("icon").parentElement?.getAttribute("aria-hidden")
    ).toBe("true");
  });
});
