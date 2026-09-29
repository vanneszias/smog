import { describe, expect, it, jest } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Text as RNText } from "react-native";
// biome-ignore lint/performance/noNamespaceImport: the test walks every export of the kit
import * as kit from "./index";
import { renderKit } from "./test/render";

const ID = "subject";
const COMPONENT_NAME = /^[A-Z]/;
const noop = jest.fn();
const OPTIONS = [
  { label: "One", value: "one" },
  { label: "Two", value: "two" },
];

/**
 * Every component, rendered with `testID`: the id must reach a host element
 * (the one Detox/Maestro and the gallery's tests target). Overlays are
 * rendered open; their id is on the content.
 */
const CASES: Record<string, ReactElement> = {
  AlertDialog: (
    <kit.AlertDialog onConfirm={noop} open testID={ID} title="Delete?" />
  ),
  Avatar: <kit.Avatar name="Zias" testID={ID} />,
  Badge: <kit.Badge testID={ID}>New</kit.Badge>,
  Button: <kit.Button testID={ID}>Save</kit.Button>,
  Card: <kit.Card testID={ID} />,
  CardContent: <kit.CardContent testID={ID} />,
  CardDescription: <kit.CardDescription testID={ID}>Text</kit.CardDescription>,
  CardFooter: <kit.CardFooter testID={ID} />,
  CardHeader: <kit.CardHeader testID={ID} />,
  CardTitle: <kit.CardTitle testID={ID}>Title</kit.CardTitle>,
  Checkbox: <kit.Checkbox label="Check" testID={ID} />,
  Chip: <kit.Chip testID={ID}>Chip</kit.Chip>,
  DialogContent: (
    <kit.Dialog open>
      <kit.DialogContent testID={ID} title="Title" />
    </kit.Dialog>
  ),
  DialogFooter: <kit.DialogFooter testID={ID} />,
  EmptyState: <kit.EmptyState testID={ID} />,
  ErrorState: <kit.ErrorState testID={ID} />,
  Field: (
    <kit.Field label="Label" testID={ID}>
      <kit.Input />
    </kit.Field>
  ),
  Heading: <kit.Heading testID={ID}>Title</kit.Heading>,
  IconButton: (
    <kit.IconButton icon={<RNText>x</RNText>} label="Close" testID={ID} />
  ),
  Input: <kit.Input testID={ID} />,
  ListItem: <kit.ListItem testID={ID} title="Row" />,
  Logo: <kit.Logo testID={ID} />,
  MenuContent: (
    <kit.Menu defaultOpen>
      <kit.MenuContent testID={ID}>
        <kit.MenuItem>Item</kit.MenuItem>
      </kit.MenuContent>
    </kit.Menu>
  ),
  MenuGroup: (
    <kit.Menu defaultOpen>
      <kit.MenuContent>
        <kit.MenuGroup testID={ID} />
      </kit.MenuContent>
    </kit.Menu>
  ),
  MenuItem: (
    <kit.Menu defaultOpen>
      <kit.MenuContent>
        <kit.MenuItem testID={ID}>Item</kit.MenuItem>
      </kit.MenuContent>
    </kit.Menu>
  ),
  MenuLabel: (
    <kit.Menu defaultOpen>
      <kit.MenuContent>
        <kit.MenuLabel testID={ID}>Label</kit.MenuLabel>
      </kit.MenuContent>
    </kit.Menu>
  ),
  MenuSeparator: (
    <kit.Menu defaultOpen>
      <kit.MenuContent>
        <kit.MenuSeparator testID={ID} />
      </kit.MenuContent>
    </kit.Menu>
  ),
  OfflineBanner: <kit.OfflineBanner online={false} testID={ID} />,
  ProgressBar: <kit.ProgressBar label="Progress" testID={ID} value={10} />,
  RadioGroup: <kit.RadioGroup options={OPTIONS} testID={ID} />,
  SearchField: <kit.SearchField testID={ID} />,
  SegmentedControl: (
    <kit.SegmentedControl
      onValueChange={noop}
      options={OPTIONS}
      testID={ID}
      value="one"
    />
  ),
  Select: <kit.Select options={OPTIONS} testID={ID} />,
  SheetContent: (
    <kit.Sheet open>
      <kit.SheetContent testID={ID} title="Title" />
    </kit.Sheet>
  ),
  SheetFooter: <kit.SheetFooter testID={ID} />,
  Skeleton: <kit.Skeleton testID={ID} />,
  Spinner: <kit.Spinner testID={ID} />,
  Stepper: <kit.Stepper current={0} steps={[{ label: "One" }]} testID={ID} />,
  Switch: <kit.Switch label="Switch" testID={ID} />,
  TabsContent: (
    <kit.Tabs defaultValue="a">
      <kit.TabsContent testID={ID} value="a" />
    </kit.Tabs>
  ),
  TabsList: (
    <kit.Tabs defaultValue="a">
      <kit.TabsList testID={ID} />
    </kit.Tabs>
  ),
  TabsTrigger: (
    <kit.Tabs defaultValue="a">
      <kit.TabsTrigger testID={ID} value="a">
        A
      </kit.TabsTrigger>
    </kit.Tabs>
  ),
  Text: <kit.Text testID={ID}>Text</kit.Text>,
  Textarea: <kit.Textarea testID={ID} />,
};

describe("the kit contract", () => {
  it.each(Object.entries(CASES))(
    "%s passes testID to a host element",
    async (_name, element) => {
      await renderKit(element);
      expect(
        screen.getByTestId(ID, { includeHiddenElements: true })
      ).toBeTruthy();
    }
  );

  it("covers every exported component", () => {
    const components = Object.entries(kit)
      .filter(
        ([name, value]) =>
          COMPONENT_NAME.test(name) &&
          typeof value === "function" &&
          !name.endsWith("Provider")
      )
      .map(([name]) => name);
    // Roots and triggers render no element of their own.
    const passThrough = new Set([
      "Dialog",
      "DialogClose",
      "DialogTrigger",
      "Menu",
      "MenuTrigger",
      "Sheet",
      "SheetClose",
      "SheetTrigger",
      "Tabs",
    ]);
    const untested = components.filter(
      (name) => !(name in CASES || passThrough.has(name))
    );
    expect(untested).toEqual([]);
  });
});
