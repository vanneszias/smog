import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderKit, t } from "../test/render";
import { Avatar } from "./avatar";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { ListItem } from "./list-item";
import { SegmentedControl } from "./segmented-control";
import { Stepper } from "./stepper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

/** The row is named by its title and description together. */
const GREETINGS = /Greetings/;

describe("Card", () => {
  it("renders its parts with the title as a header", async () => {
    await renderKit(
      <Card testID="card" variant="raised">
        <CardHeader>
          <CardTitle>Greetings</CardTitle>
        </CardHeader>
        <CardContent />
      </Card>
    );
    expect(screen.getByRole("header", { name: "Greetings" })).toBeOnTheScreen();
    expect(screen.getByTestId("card")).toHaveStyle({ borderRadius: 14 });
  });

  it("becomes a button with onPress", async () => {
    const onPress = jest.fn();
    await renderKit(
      <Card accessibilityLabel="Greetings" onPress={onPress}>
        <CardTitle>Greetings</CardTitle>
      </Card>
    );
    await fireEvent.press(screen.getByRole("button", { name: "Greetings" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("ListItem", () => {
  it("is static without onPress", async () => {
    await renderKit(<ListItem description="12 gestures" title="Greetings" />);
    expect(screen.getByText("Greetings")).toBeOnTheScreen();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("becomes a 44 pt button row with onPress", async () => {
    const onPress = jest.fn();
    await renderKit(
      <ListItem description="12 gestures" onPress={onPress} title="Greetings" />
    );
    const row = screen.getByRole("button", { name: GREETINGS });
    expect(row).toHaveStyle({ minHeight: 44 });
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire while disabled", async () => {
    const onPress = jest.fn();
    await renderKit(<ListItem disabled onPress={onPress} title="Greetings" />);
    const row = screen.getByRole("button", { name: GREETINGS });
    expect(row).toBeDisabled();
    await fireEvent.press(row);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("Avatar", () => {
  it("is an image named by the person with initials", async () => {
    await renderKit(<Avatar name="Zias van Nes" />);
    expect(
      screen.getByRole("image", { name: "Zias van Nes" })
    ).toBeOnTheScreen();
    expect(screen.getByText("ZN")).toBeOnTheScreen();
  });

  it("is 40 pt at md", async () => {
    await renderKit(<Avatar name="Zias" testID="avatar" />);
    expect(screen.getByTestId("avatar")).toHaveStyle({
      height: 40,
      width: 40,
    });
  });
});

describe("Tabs", () => {
  it("switches the panel with the tab", async () => {
    const onValueChange = jest.fn();
    await renderKit(
      <Tabs defaultValue="all" onValueChange={onValueChange}>
        <TabsList aria-label="Filter">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="mine">Mine</TabsTrigger>
          <TabsTrigger disabled value="shared">
            Shared
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all">All panel</TabsContent>
        <TabsContent value="mine">Mine panel</TabsContent>
      </Tabs>
    );
    // Containers stay non-accessible so their children remain focusable;
    // RNTL's role queries only see accessibility elements, so find by label.
    expect(screen.getByLabelText("Filter").props.accessibilityRole).toBe(
      "tablist"
    );
    expect(screen.getByRole("tab", { name: "All" })).toBeSelected();
    expect(screen.getByText("All panel")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("tab", { name: "Mine" }));
    expect(onValueChange).toHaveBeenCalledWith("mine");
    expect(screen.getByRole("tab", { name: "Mine" })).toBeSelected();
    expect(screen.getByText("Mine panel")).toBeOnTheScreen();
    expect(screen.queryByText("All panel")).toBeNull();
    expect(screen.getByRole("tab", { name: "Shared" })).toBeDisabled();
  });
});

describe("SegmentedControl", () => {
  it("is a radiogroup that always has a value", async () => {
    const onValueChange = jest.fn();
    await renderKit(
      <SegmentedControl
        aria-label={t("theme.label")}
        onValueChange={onValueChange}
        options={[
          { label: t("theme.light"), value: "light" },
          { label: t("theme.dark"), value: "dark" },
        ]}
        value="light"
      />
    );
    expect(
      screen.getByLabelText(t("theme.label")).props.accessibilityRole
    ).toBe("radiogroup");
    expect(screen.getByRole("radio", { name: t("theme.light") })).toBeChecked();
    await fireEvent.press(screen.getByRole("radio", { name: t("theme.dark") }));
    expect(onValueChange).toHaveBeenCalledWith("dark");
  });

  it("keeps a 44 pt target at sm", async () => {
    await renderKit(
      <SegmentedControl
        aria-label="Theme"
        onValueChange={jest.fn()}
        options={[{ label: "Light", value: "light" }]}
        size="sm"
        value="light"
      />
    );
    expect(screen.getByRole("radio", { name: "Light" }).props.hitSlop).toEqual({
      bottom: 6,
      top: 6,
    });
  });
});

describe("Stepper", () => {
  it("names the steps and marks done and current ones", async () => {
    await renderKit(
      <Stepper
        current={1}
        steps={[{ label: "Choose" }, { label: "Details" }, { label: "Pay" }]}
      />
    );
    expect(screen.getByLabelText(t("a11y.steps"))).toBeOnTheScreen();
    expect(
      screen.getByText(t("kit.stepOf", { current: 2, total: 3 }))
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText(`Choose (${t("a11y.stepCompleted")})`)
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Details")).toBeSelected();
  });
});
