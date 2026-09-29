import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { classesOf, renderKit } from "../test/render";
import { IconButton } from "./icon-button";

describe("IconButton", () => {
  test("is named by its label, ghost md by default, 44 px", async () => {
    const onClick = mock();
    renderKit(
      <IconButton icon={<svg />} label="More actions" onClick={onClick} />
    );
    const button = screen.getByRole("button", { name: "More actions" });
    expect(classesOf(button)).toContain("bg-transparent");
    expect(classesOf(button)).toContain("size-touch");
    expect(classesOf(button)).toContain("focus-visible:ring-2");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("variants and sizes; sm keeps a 44 px hit area", () => {
    renderKit(
      <>
        <IconButton icon={<svg />} label="a" size="lg" variant="primary" />
        <IconButton icon={<svg />} label="b" size="sm" variant="secondary" />
      </>
    );
    expect(classesOf(screen.getByRole("button", { name: "a" }))).toContain(
      "size-12"
    );
    const small = classesOf(screen.getByRole("button", { name: "b" }));
    expect(small).toContain("size-8");
    expect(small).toContain("after:size-touch");
    expect(small).toContain("border-foreground-muted");
  });

  test("forwards the ref", () => {
    const ref = createRef<HTMLButtonElement>();
    renderKit(<IconButton icon={<svg />} label="x" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
