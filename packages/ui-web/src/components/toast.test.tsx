import { describe, expect, test } from "bun:test";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useCallback } from "react";
import { classesOf, renderKit } from "../test/render";
import { Button } from "./button";
import { ToastProvider, useToast } from "./toast";

const NOTIFICATIONS = /Notifications/;

function Trigger(): ReactNode {
  const { toast } = useToast();
  const show = useCallback(
    () =>
      toast({
        description: "Added to Favorites.",
        title: "Saved",
        variant: "success",
      }),
    [toast]
  );
  return <Button onClick={show}>Save</Button>;
}

describe("Toast", () => {
  test("useToast shows a toast in the labelled region; it can be dismissed", async () => {
    renderKit(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    expect(screen.getByRole("region", { name: NOTIFICATIONS })).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const title = screen.getByText("Saved");
    const toast = title.closest("li");
    expect(toast).not.toBeNull();
    expect(classesOf(toast)).toContain("shadow-3");
    expect(classesOf(toast)).toContain("motion-reduce:animate-none");
    expect(screen.getByText("Added to Favorites.")).toBeDefined();
    await act(async () => {
      await userEvent.click(
        screen.getByRole("button", { name: "Dismiss notification" })
      );
    });
    expect(screen.queryByText("Saved")).toBeNull();
  });

  test("useToast outside the provider throws", () => {
    expect(() => renderKit(<Trigger />)).toThrow();
  });
});
