import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { Button } from "../components/button";
import { renderKit, t } from "../test/render";
import { ListPicker } from "./list-picker";
import { ShareLink } from "./share-link";

const noop = (): void => undefined;
const LISTS = [
  { contains: true, id: "l1", name: "At school" },
  { contains: false, id: "l2", name: "At home" },
];
const URL = "https://smog.example/lists/shared/abc";

describe("ListPicker", () => {
  it("the trigger opens a sheet with a checkbox per list", async () => {
    const onToggle = jest.fn();
    await renderKit(
      <ListPicker lists={LISTS} onCreate={noop} onToggle={onToggle}>
        <Button>Save</Button>
      </ListPicker>
    );
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(
      screen.getByRole("header", { name: t("lists.addToList") })
    ).toBeOnTheScreen();
    const school = screen.getByRole("checkbox", { name: "At school" });
    expect(school.props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByRole("checkbox", { name: "At home" }));
    expect(onToggle).toHaveBeenCalledWith("l2");
  });

  it("creates a list from the trimmed name and clears the field", async () => {
    const onCreate = jest.fn();
    await renderKit(
      <ListPicker lists={[]} onCreate={onCreate} onToggle={noop} open />
    );
    expect(screen.getByText(t("lists.noLists"))).toBeOnTheScreen();
    const create = screen.getByRole("button", { name: t("lists.create") });
    expect(create).toBeDisabled();
    const input = screen.getByLabelText(t("lists.newList"));
    await fireEvent.changeText(input, "  Class 3  ");
    await fireEvent.press(create);
    expect(onCreate).toHaveBeenCalledWith("Class 3");
    expect(input.props.value).toBe("");
    await fireEvent.changeText(input, "Songs");
    await fireEvent(input, "submitEditing");
    expect(onCreate).toHaveBeenLastCalledWith("Songs");
  });

  it("nameMaxLength limits the field", async () => {
    await renderKit(
      <ListPicker
        lists={LISTS}
        nameMaxLength={80}
        onCreate={noop}
        onToggle={noop}
        open
      />
    );
    expect(screen.getByLabelText(t("lists.newList")).props.maxLength).toBe(80);
  });
});

describe("ShareLink", () => {
  it("a view link: heading, description and the url", async () => {
    await renderKit(
      <ShareLink access="view" onCopy={noop} onRevoke={noop} url={URL} />
    );
    expect(
      screen.getByRole("header", { name: t("lists.share.viewTitle") })
    ).toBeOnTheScreen();
    expect(
      screen.getByText(t("lists.share.viewDescription"))
    ).toBeOnTheScreen();
    const field = screen.getByLabelText(t("lists.share.linkLabel"));
    expect(field.props.value).toBe(URL);
    expect(field.props.editable).toBe(false);
  });

  it("an edit link says sign-in is needed", async () => {
    await renderKit(
      <ShareLink access="edit" onCopy={noop} onRevoke={noop} url={URL} />
    );
    expect(
      screen.getByRole("header", { name: t("lists.share.editTitle") })
    ).toBeOnTheScreen();
    expect(
      screen.getByText(t("lists.share.editDescription"))
    ).toBeOnTheScreen();
  });

  it("copy calls onCopy, says Copied and announces it", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const onCopy = jest.fn();
    await renderKit(
      <ShareLink access="view" onCopy={onCopy} onRevoke={noop} url={URL} />
    );
    await fireEvent.press(
      screen.getByRole("button", { name: t("lists.share.copyLink") })
    );
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(t("kit.copied"));
    expect(
      screen.getByRole("button", { name: t("kit.copied") })
    ).toBeOnTheScreen();
  });

  it("revoke asks first", async () => {
    const onRevoke = jest.fn();
    await renderKit(
      <ShareLink access="view" onCopy={noop} onRevoke={onRevoke} url={URL} />
    );
    await fireEvent.press(
      screen.getByRole("button", { name: t("lists.share.revoke") })
    );
    expect(onRevoke).not.toHaveBeenCalled();
    expect(
      screen.getByRole("header", { name: t("lists.share.revokeTitle") })
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: t("lists.share.revokeConfirm") })
    );
    expect(onRevoke).toHaveBeenCalledTimes(1);
  });
});
