import { describe, expect, it, jest } from "@jest/globals";
import { tokens } from "@smog/styles/tokens";
import { act, fireEvent, screen, within } from "@testing-library/react-native";
import { notificationAsync } from "expo-haptics";
import { colorScheme } from "nativewind";
import { type ReactElement, useCallback } from "react";
import { Text } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { rgba } from "../test/colour";
import { renderKit, t } from "../test/render";
import { AlertDialog } from "./alert-dialog";
import { Button } from "./button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "./dialog";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "./menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetTrigger,
} from "./sheet";
import { useToast } from "./toast";

describe("Dialog", () => {
  it("opens from its trigger and closes with the close button", async () => {
    await renderKit(
      <Dialog>
        <DialogTrigger>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogContent description="Details" title="Share list">
          <DialogFooter>
            <DialogClose>
              <Button>Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
    expect(screen.queryByText("Share list")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Open" }));
    expect(
      screen.getByRole("header", { name: "Share list" })
    ).toBeOnTheScreen();
    expect(screen.getByText("Details")).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: t("a11y.close") })
    );
    expect(screen.queryByText("Share list")).toBeNull();
  });

  it("closes through DialogClose and reports it when controlled", async () => {
    const onOpenChange = jest.fn();
    await renderKit(
      <Dialog onOpenChange={onOpenChange} open>
        <DialogContent hideClose title="Share list">
          <DialogClose>
            <Button>Done</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    );
    expect(screen.queryByRole("button", { name: t("a11y.close") })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("AlertDialog", () => {
  it("shows a body and confirmDisabled blocks confirm", async () => {
    const onConfirm = jest.fn();
    await renderKit(
      <AlertDialog
        body={<Text>Type DELETE</Text>}
        confirmDisabled
        onConfirm={onConfirm}
        open
        title="Delete account?"
      />
    );
    expect(screen.getByText("Type DELETE")).toBeOnTheScreen();
    const confirm = screen.getByRole("button", { name: t("kit.confirm") });
    expect(confirm).toBeDisabled();
    await fireEvent.press(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms a danger action with the warning haptic", async () => {
    const onConfirm = jest.fn();
    await renderKit(
      <AlertDialog
        description="This cannot be undone."
        onConfirm={onConfirm}
        testID="alert"
        title="Delete list?"
        tone="danger"
      >
        <Button>Delete</Button>
      </AlertDialog>
    );
    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByTestId("alert").props.accessibilityRole).toBe("alert");
    await fireEvent.press(
      screen.getByRole("button", { name: t("kit.confirm") })
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(notificationAsync).toHaveBeenCalled();
  });

  it("cancels without confirming", async () => {
    const onConfirm = jest.fn();
    const onOpenChange = jest.fn();
    await renderKit(
      <AlertDialog
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
        open
        title="Delete list?"
      />
    );
    await fireEvent.press(
      screen.getByRole("button", { name: t("kit.cancel") })
    );
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the busy confirm while loading", async () => {
    await renderKit(
      <AlertDialog loading onConfirm={jest.fn()} open title="Delete?" />
    );
    expect(screen.getByRole("button", { name: t("kit.confirm") })).toBeBusy();
  });
});

describe("Sheet", () => {
  it("opens from its trigger and closes with SheetClose", async () => {
    await renderKit(
      <Sheet>
        <SheetTrigger>
          <Button>Filters</Button>
        </SheetTrigger>
        <SheetContent title="Filter gestures">
          <SheetFooter>
            <SheetClose>
              <Button>Apply</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
    expect(screen.queryByText("Filter gestures")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Filters" }));
    expect(
      screen.getByRole("header", { name: "Filter gestures" })
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Apply" }));
    expect(screen.queryByText("Filter gestures")).toBeNull();
  });

  it("has a close button named a11y.close", async () => {
    const onOpenChange = jest.fn();
    await renderKit(
      <Sheet onOpenChange={onOpenChange} open>
        <SheetContent title="Filter gestures" />
      </Sheet>
    );
    await fireEvent.press(
      screen.getByRole("button", { name: t("a11y.close") })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("Menu", () => {
  it("opens an action sheet of menu items; selecting one runs it and closes", async () => {
    const onSelect = jest.fn();
    const onDelete = jest.fn();
    await renderKit(
      <Menu>
        <MenuTrigger>
          <Button>{t("a11y.moreActions")}</Button>
        </MenuTrigger>
        <MenuContent testID="menu">
          <MenuLabel>List</MenuLabel>
          <MenuItem onSelect={onSelect}>Edit</MenuItem>
          <MenuItem disabled onSelect={onSelect}>
            Share
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={onDelete} variant="danger">
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    );
    expect(screen.queryByRole("menuitem")).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: t("a11y.moreActions") })
    );
    expect(screen.getByTestId("menu").props.accessibilityRole).toBe("menu");
    expect(screen.getByRole("menuitem", { name: "Share" })).toBeDisabled();
    const edit = screen.getByRole("menuitem", { name: "Edit" });
    expect(edit).toHaveStyle({ minHeight: 44 });
    await fireEvent.press(edit);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menuitem")).toBeNull();
  });
});

function ToastButton(): ReactElement {
  const { toast } = useToast();
  const show = useCallback((): void => {
    toast({ description: "Added to Favorites", title: "Saved" });
  }, [toast]);
  return <Button onPress={show}>Show</Button>;
}

function DangerToastButton(): ReactElement {
  const { toast } = useToast();
  const fail = useCallback((): void => {
    toast({ title: "Failed", variant: "danger" });
  }, [toast]);
  return <Button onPress={fail}>Fail</Button>;
}

describe("Toast", () => {
  it("draws above an open dialog, once", async () => {
    await renderKit(
      <Dialog open>
        <DialogContent title="Share list">
          <ToastButton />
        </DialogContent>
      </Dialog>
    );
    await fireEvent.press(screen.getByRole("button", { name: "Show" }));
    // Only the topmost viewport (inside the dialog's modal) draws it.
    expect(screen.getAllByTestId("toast")).toHaveLength(1);
    const modalRoot = screen.getByTestId("overlay-theme-root");
    expect(within(modalRoot).getByText("Saved")).toBeOnTheScreen();
  });

  it("draws above an open sheet, once", async () => {
    await renderKit(
      <Sheet open>
        <SheetContent title="Filter gestures">
          <ToastButton />
        </SheetContent>
      </Sheet>
    );
    await fireEvent.press(screen.getByRole("button", { name: "Show" }));
    expect(screen.getAllByTestId("toast")).toHaveLength(1);
    expect(
      within(screen.getByTestId("sheet-toasts")).getByText("Saved")
    ).toBeOnTheScreen();
  });

  it("moves back to the screen when the dialog closes", async () => {
    await renderKit(
      <Dialog defaultOpen>
        <DialogContent title="Share list">
          <ToastButton />
        </DialogContent>
      </Dialog>
    );
    await fireEvent.press(screen.getByRole("button", { name: "Show" }));
    await fireEvent.press(
      screen.getByRole("button", { name: t("a11y.close") })
    );
    expect(screen.getAllByTestId("toast")).toHaveLength(1);
    expect(screen.queryByTestId("overlay-theme-root")).toBeNull();
  });

  it("shows a polite toast in the notifications region and dismisses it", async () => {
    await renderKit(<ToastButton />);
    await fireEvent.press(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByLabelText(t("a11y.notifications"))).toBeOnTheScreen();
    const toast = screen.getByTestId("toast");
    expect(toast.props.accessibilityLiveRegion).toBe("polite");
    expect(screen.getByText("Added to Favorites")).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: t("a11y.dismiss") })
    );
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("makes danger toasts assertive alerts", async () => {
    await renderKit(<DangerToastButton />);
    await fireEvent.press(screen.getByRole("button", { name: "Fail" }));
    const toast = screen.getByTestId("toast");
    expect(toast.props.accessibilityRole).toBe("alert");
    expect(toast.props.accessibilityLiveRegion).toBe("assertive");
  });

  it("closes after its duration", async () => {
    jest.useFakeTimers();
    try {
      await renderKit(<ToastButton />);
      await fireEvent.press(screen.getByRole("button", { name: "Show" }));
      expect(screen.getByText("Saved")).toBeOnTheScreen();
      await act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(screen.queryByText("Saved")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("Text in overlays", () => {
  it("resolves token colours from the variables at the overlay root", async () => {
    await renderKit(
      <Dialog open>
        <DialogContent title="Themed">
          <Text>Body</Text>
        </DialogContent>
      </Dialog>
    );
    // `text-foreground` is `rgb(var(--color-foreground) / 1)`; it only
    // resolves because the modal root re-applies the variables.
    expect(screen.getByRole("header", { name: "Themed" })).toHaveStyle({
      color: rgba(tokens.color.light.foreground),
    });
  });

  it("follows the dark scheme", async () => {
    await act(() => {
      colorScheme.set("dark");
    });
    try {
      await renderKit(
        <Dialog open>
          <DialogContent title="Themed" />
        </Dialog>
      );
      expect(screen.getByRole("header", { name: "Themed" })).toHaveStyle({
        color: rgba(tokens.color.dark.foreground),
      });
    } finally {
      await act(() => {
        colorScheme.set("light");
      });
    }
  });
});

describe("reduced motion", () => {
  function modalAnimation(): unknown {
    const modal = screen.root?.queryAll(
      (node) => node.props.animationType !== undefined
    )[0];
    return modal?.props.animationType;
  }

  it("fades dialogs in by default", async () => {
    await renderKit(
      <Dialog open>
        <DialogContent title="Share list" />
      </Dialog>
    );
    expect(modalAnimation()).toBe("fade");
  });

  it("shows dialogs at once when the system asks for less motion", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    try {
      await renderKit(
        <Dialog open>
          <DialogContent title="Share list" />
        </Dialog>
      );
      expect(modalAnimation()).toBe("none");
    } finally {
      jest.mocked(useReducedMotion).mockReturnValue(false);
    }
  });
});
