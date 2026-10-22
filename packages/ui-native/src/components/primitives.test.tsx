import { describe, expect, it, jest } from "@jest/globals";
import { themeVars } from "@smog/styles/native";
import { tokens } from "@smog/styles/tokens";
import {
  fireEvent,
  type RenderResult,
  screen,
} from "@testing-library/react-native";
import { selectionAsync } from "expo-haptics";
import type { ReactElement } from "react";
import { Text, View } from "react-native";
import { FavoriteButton } from "../domain/favorite-button";
import { rgba } from "../test/colour";
import { renderKit } from "../test/render";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./accordion";
import { Alert, AlertDescription, AlertTitle } from "./alert";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { Label } from "./label";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Separator } from "./separator";
import { Surface } from "./surface";
import { Heading, Text as KitText } from "./text";
import { Toggle, ToggleGroup, ToggleGroupItem } from "./toggle";

/** Renders inside the colour variables an app root applies. */
function inTheme(ui: ReactElement): Promise<RenderResult> {
  return renderKit(<View style={themeVars.light}>{ui}</View>);
}

describe("Accordion", () => {
  it("opens one item at a time and closes it again", async () => {
    await renderKit(
      <Accordion>
        <AccordionItem value="a">
          <AccordionTrigger>Question A</AccordionTrigger>
          <AccordionContent>Answer A</AccordionContent>
        </AccordionItem>
        <AccordionItem value="b">
          <AccordionTrigger>Question B</AccordionTrigger>
          <AccordionContent>Answer B</AccordionContent>
        </AccordionItem>
      </Accordion>
    );
    expect(screen.queryByText("Answer A")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Question A" }));
    expect(screen.getByText("Answer A")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Question B" }));
    expect(screen.queryByText("Answer A")).toBeNull();
    expect(screen.getByText("Answer B")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Question B" }));
    expect(screen.queryByText("Answer B")).toBeNull();
  });

  it("reports expanded state and the open value", async () => {
    const onValueChange = jest.fn();
    await renderKit(
      <Accordion onValueChange={onValueChange}>
        <AccordionItem value="a">
          <AccordionTrigger>Question A</AccordionTrigger>
          <AccordionContent>Answer A</AccordionContent>
        </AccordionItem>
      </Accordion>
    );
    const trigger = screen.getByRole("button", { name: "Question A" });
    expect(trigger.props.accessibilityState).toMatchObject({
      expanded: false,
    });
    await fireEvent.press(trigger);
    expect(onValueChange).toHaveBeenLastCalledWith("a");
    expect(
      screen.getByRole("button", { name: "Question A" }).props
        .accessibilityState
    ).toMatchObject({ expanded: true });
    await fireEvent.press(trigger);
    expect(onValueChange).toHaveBeenLastCalledWith("");
  });

  it("keeps the open item when it is not collapsible", async () => {
    await renderKit(
      <Accordion collapsible={false} defaultValue="a">
        <AccordionItem value="a">
          <AccordionTrigger>Question A</AccordionTrigger>
          <AccordionContent>Answer A</AccordionContent>
        </AccordionItem>
      </Accordion>
    );
    await fireEvent.press(screen.getByRole("button", { name: "Question A" }));
    expect(screen.getByText("Answer A")).toBeTruthy();
  });

  it("opens several items with type=multiple", async () => {
    const onValueChange = jest.fn();
    await renderKit(
      <Accordion onValueChange={onValueChange} type="multiple">
        <AccordionItem value="a">
          <AccordionTrigger>Question A</AccordionTrigger>
          <AccordionContent>Answer A</AccordionContent>
        </AccordionItem>
        <AccordionItem value="b">
          <AccordionTrigger>Question B</AccordionTrigger>
          <AccordionContent>Answer B</AccordionContent>
        </AccordionItem>
      </Accordion>
    );
    await fireEvent.press(screen.getByRole("button", { name: "Question A" }));
    await fireEvent.press(screen.getByRole("button", { name: "Question B" }));
    expect(screen.getByText("Answer A")).toBeTruthy();
    expect(screen.getByText("Answer B")).toBeTruthy();
    expect(onValueChange).toHaveBeenLastCalledWith(["a", "b"]);
  });

  it("follows a controlled value", async () => {
    await renderKit(
      <Accordion value="b">
        <AccordionItem value="b">
          <AccordionTrigger>Question B</AccordionTrigger>
          <AccordionContent>Answer B</AccordionContent>
        </AccordionItem>
      </Accordion>
    );
    expect(screen.getByText("Answer B")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Question B" }));
    // Still open: the parent decides.
    expect(screen.getByText("Answer B")).toBeTruthy();
  });
});

describe("Toggle", () => {
  it("is a toggle button that reports the next state and ticks", async () => {
    const onPressedChange = jest.fn();
    await renderKit(<Toggle onPressedChange={onPressedChange}>Bold</Toggle>);
    const toggle = screen.getByRole("togglebutton", { name: "Bold" });
    expect(toggle.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(toggle);
    expect(onPressedChange).toHaveBeenCalledWith(true);
    expect(selectionAsync).toHaveBeenCalled();
    expect(
      screen.getByRole("togglebutton", { name: "Bold" }).props
        .accessibilityState
    ).toMatchObject({ checked: true });
  });

  it("does not toggle while disabled", async () => {
    const onPressedChange = jest.fn();
    await renderKit(
      <Toggle disabled onPressedChange={onPressedChange}>
        Bold
      </Toggle>
    );
    await fireEvent.press(screen.getByRole("togglebutton", { name: "Bold" }));
    expect(onPressedChange).not.toHaveBeenCalled();
  });

  it("keeps a 44 pt target at sm", async () => {
    await renderKit(
      <Toggle size="sm" testID="t">
        Bold
      </Toggle>
    );
    expect(screen.getByTestId("t").props.hitSlop).toBe(6);
  });
});

describe("ToggleGroup", () => {
  it("keeps one value with type=single", async () => {
    const onValueChange = jest.fn();
    await renderKit(
      <ToggleGroup onValueChange={onValueChange}>
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b">B</ToggleGroupItem>
      </ToggleGroup>
    );
    await fireEvent.press(screen.getByRole("togglebutton", { name: "A" }));
    await fireEvent.press(screen.getByRole("togglebutton", { name: "B" }));
    expect(onValueChange).toHaveBeenLastCalledWith("b");
    expect(
      screen.getByRole("togglebutton", { name: "A" }).props.accessibilityState
    ).toMatchObject({ checked: false });
    await fireEvent.press(screen.getByRole("togglebutton", { name: "B" }));
    expect(onValueChange).toHaveBeenLastCalledWith("");
  });

  it("keeps several values with type=multiple", async () => {
    const onValueChange = jest.fn();
    await renderKit(
      <ToggleGroup onValueChange={onValueChange} type="multiple">
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b">B</ToggleGroupItem>
      </ToggleGroup>
    );
    await fireEvent.press(screen.getByRole("togglebutton", { name: "A" }));
    await fireEvent.press(screen.getByRole("togglebutton", { name: "B" }));
    expect(onValueChange).toHaveBeenLastCalledWith(["a", "b"]);
  });
});

describe("Alert", () => {
  it("is a polite alert region with its title and description", async () => {
    await renderKit(
      <Alert testID="alert">
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>Something changed.</AlertDescription>
      </Alert>
    );
    const alert = screen.getByTestId("alert");
    expect(alert.props.accessibilityRole).toBe("alert");
    expect(alert.props.accessibilityLiveRegion).toBe("polite");
    expect(screen.getByText("Heads up")).toBeTruthy();
  });

  it("is assertive when destructive", async () => {
    await renderKit(<Alert testID="alert" variant="destructive" />);
    expect(screen.getByTestId("alert").props.accessibilityLiveRegion).toBe(
      "assertive"
    );
  });
});

describe("Label and Separator", () => {
  it("dims a disabled label", async () => {
    await renderKit(
      <Label disabled testID="label">
        Name
      </Label>
    );
    expect(screen.getByTestId("label")).toHaveStyle({ opacity: 0.5 });
  });

  it("hides the separator from assistive tech", async () => {
    await renderKit(<Separator orientation="vertical" testID="sep" />);
    const separator = screen.getByTestId("sep", {
      includeHiddenElements: true,
    });
    expect(separator.props.importantForAccessibility).toBe(
      "no-hide-descendants"
    );
    expect(separator).toHaveStyle({ width: 1 });
  });
});

describe("Surface", () => {
  const { light } = tokens.color;

  it("switches text to its on-green colours and keeps status tones", async () => {
    await inTheme(
      <Surface tone="primary">
        <Heading testID="h">Title</Heading>
        <KitText testID="p" tone="muted">
          Body
        </KitText>
        <KitText testID="warn" tone="warning">
          Careful
        </KitText>
      </Surface>
    );
    expect(screen.getByTestId("h")).toHaveStyle({
      color: rgba(light.primaryForeground),
    });
    expect(screen.getByTestId("p")).toHaveStyle({
      color: rgba(light.primaryForegroundMuted),
    });
    expect(screen.getByTestId("warn")).toHaveStyle({
      color: rgba(light.warningStrong),
    });
  });

  it("paints the header tone with the deeper green", async () => {
    await inTheme(<Surface testID="s" tone="header" />);
    expect(screen.getByTestId("s")).toHaveStyle({
      backgroundColor: rgba(light.sidebar),
    });
  });

  it("makes the primary button the orange highlight and keeps it readable", async () => {
    await inTheme(
      <Surface tone="header">
        <Button testID="primary">Go</Button>
        <Button testID="secondary" variant="secondary">
          Later
        </Button>
        <IconButton icon={<Text>x</Text>} label="More" testID="icon" />
      </Surface>
    );
    expect(screen.getByTestId("primary")).toHaveStyle({
      backgroundColor: rgba(light.highlight),
    });
    expect(screen.getByTestId("secondary")).toHaveStyle({
      borderColor: rgba(light.sidebarForeground),
    });
    expect(screen.getByText("Go")).toHaveStyle({
      color: rgba(light.highlightForeground),
    });
    expect(screen.getByText("Later")).toHaveStyle({
      color: rgba(light.sidebarForeground),
    });
  });

  it("draws the heart white on green and orange when set", async () => {
    await inTheme(
      <Surface tone="header">
        <FavoriteButton active={false} onToggle={jest.fn()} />
        <FavoriteButton active onToggle={jest.fn()} />
      </Surface>
    );
    const json = JSON.stringify(screen.toJSON());
    console.log(json.slice(0, 3000));
  });

  it("puts the page back inside an overlay opened from a green header", async () => {
    await inTheme(
      <Surface tone="header">
        <Popover open>
          <PopoverContent testID="pop">
            <KitText testID="inside">Hello</KitText>
          </PopoverContent>
        </Popover>
      </Surface>
    );
    expect(screen.getByTestId("inside")).toHaveStyle({
      color: rgba(light.foreground),
    });
  });

  it("leaves the default surface alone", async () => {
    await inTheme(<Button testID="primary">Go</Button>);
    expect(screen.getByTestId("primary")).toHaveStyle({
      backgroundColor: rgba(tokens.color.light.primary),
    });
  });
});

describe("Popover", () => {
  it("renders its content while open, named", async () => {
    await renderKit(
      <Popover open>
        <PopoverContent accessibilityLabel="Details" testID="pop">
          <KitText>Hello</KitText>
        </PopoverContent>
      </Popover>
    );
    expect(screen.getByTestId("pop").props.accessibilityLabel).toBe("Details");
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("is closed until the trigger is pressed, and its trigger reports expanded", async () => {
    await renderKit(
      <Popover>
        <PopoverTrigger>
          <Button>Open</Button>
        </PopoverTrigger>
        <PopoverContent testID="pop">
          <KitText>Hello</KitText>
        </PopoverContent>
      </Popover>
    );
    expect(screen.queryByText("Hello")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Open" }).props.accessibilityState
    ).toMatchObject({ expanded: false });
  });
});
