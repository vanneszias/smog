import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderKit } from "../test/render";
import { ShareLink } from "./share-link";

const noop = (): void => undefined;

const URL = "https://smog.example/lists/shared/abc";

describe("ShareLink", () => {
  test("a view link: heading, description and the read-only url", () => {
    renderKit(
      <ShareLink onCopy={noop} onRevoke={noop} role="view" url={URL} />
    );
    expect(screen.getByRole("heading", { name: "View link" })).toBeDefined();
    expect(
      screen.getByText("Anyone with this link can view the list.")
    ).toBeDefined();
    const field = screen.getByRole("textbox", {
      name: "Link",
    }) as HTMLInputElement;
    expect(field.value).toBe(URL);
    expect(field.readOnly).toBe(true);
  });

  test("an edit link says sign-in is needed", () => {
    renderKit(
      <ShareLink onCopy={noop} onRevoke={noop} role="edit" url={URL} />
    );
    expect(screen.getByRole("heading", { name: "Edit link" })).toBeDefined();
    expect(
      screen.getByText(
        "Anyone with this link can edit the list after signing in."
      )
    ).toBeDefined();
  });

  test("copy calls onCopy and confirms with Copied", async () => {
    const onCopy = mock();
    renderKit(
      <ShareLink onCopy={onCopy} onRevoke={noop} role="view" url={URL} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Copied" })).toBeDefined();
  });

  test("revoke asks first, then calls onRevoke", async () => {
    const onRevoke = mock();
    renderKit(
      <ShareLink onCopy={noop} onRevoke={onRevoke} role="view" url={URL} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Revoke link" }));
    expect(onRevoke).not.toHaveBeenCalled();
    expect(
      screen.getByRole("alertdialog", { name: "Revoke this link?" })
    ).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(onRevoke).toHaveBeenCalledTimes(1);
  });
});
