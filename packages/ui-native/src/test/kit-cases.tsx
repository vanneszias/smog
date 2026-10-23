import { jest } from "@jest/globals";
import type { ReactElement } from "react";
import { Text as RNText } from "react-native";
// biome-ignore lint/performance/noNamespaceImport: the cases name every export of the kit
import * as kit from "../index";
import { HELLO } from "./gestures";

export const ID = "subject";
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
export const CASES: Record<string, ReactElement> = {
  Accordion: <kit.Accordion testID={ID} />,
  AccordionContent: (
    <kit.Accordion defaultValue="a">
      <kit.AccordionItem value="a">
        <kit.AccordionContent testID={ID}>Body</kit.AccordionContent>
      </kit.AccordionItem>
    </kit.Accordion>
  ),
  AccordionItem: (
    <kit.Accordion>
      <kit.AccordionItem testID={ID} value="a" />
    </kit.Accordion>
  ),
  AccordionTrigger: (
    <kit.Accordion>
      <kit.AccordionItem value="a">
        <kit.AccordionTrigger testID={ID}>Question</kit.AccordionTrigger>
      </kit.AccordionItem>
    </kit.Accordion>
  ),
  Alert: <kit.Alert testID={ID} />,
  AlertDescription: (
    <kit.AlertDescription testID={ID}>Text</kit.AlertDescription>
  ),
  AlertDialog: (
    <kit.AlertDialog onConfirm={noop} open testID={ID} title="Delete?" />
  ),
  AlertTitle: <kit.AlertTitle testID={ID}>Title</kit.AlertTitle>,
  AudioButton: <kit.AudioButton src="https://example.test/a.mp3" testID={ID} />,
  Avatar: <kit.Avatar name="Zias" testID={ID} />,
  Badge: <kit.Badge testID={ID}>New</kit.Badge>,
  Button: <kit.Button testID={ID}>Save</kit.Button>,
  Card: <kit.Card testID={ID} />,
  CardContent: <kit.CardContent testID={ID} />,
  CardDescription: <kit.CardDescription testID={ID}>Text</kit.CardDescription>,
  CardFooter: <kit.CardFooter testID={ID} />,
  CardHeader: <kit.CardHeader testID={ID} />,
  CardTitle: <kit.CardTitle testID={ID}>Title</kit.CardTitle>,
  // Domain components.
  CategoryChips: (
    <kit.CategoryChips
      categories={HELLO.categories}
      onChange={noop}
      selected={[]}
      testID={ID}
    />
  ),
  Checkbox: <kit.Checkbox label="Check" testID={ID} />,
  Chip: <kit.Chip testID={ID}>Chip</kit.Chip>,
  ConsentBanner: (
    <kit.ConsentBanner
      onAllow={noop}
      onDecline={noop}
      onDismiss={noop}
      onOpenPrivacy={noop}
      open
      testID={ID}
    />
  ),
  CourseBanner: (
    <kit.CourseBanner
      courseUrl="https://example.org"
      messageIndex={1}
      testID={ID}
    />
  ),
  DialogContent: (
    <kit.Dialog open>
      <kit.DialogContent testID={ID} title="Title" />
    </kit.Dialog>
  ),
  DialogFooter: <kit.DialogFooter testID={ID} />,
  EmptyState: <kit.EmptyState testID={ID} />,
  ErrorState: <kit.ErrorState testID={ID} />,
  FavoriteButton: <kit.FavoriteButton active onToggle={noop} testID={ID} />,
  FavoritesEmptyState: <kit.FavoritesEmptyState testID={ID} />,
  Field: (
    <kit.Field label="Label" testID={ID}>
      <kit.Input />
    </kit.Field>
  ),
  GestureCard: <kit.GestureCard gesture={HELLO} testID={ID} />,
  GestureGrid: <kit.GestureGrid items={[HELLO]} testID={ID} />,
  GestureRow: <kit.GestureRow gesture={HELLO} testID={ID} />,
  Heading: <kit.Heading testID={ID}>Title</kit.Heading>,
  IconButton: (
    <kit.IconButton icon={<RNText>x</RNText>} label="Close" testID={ID} />
  ),
  Input: <kit.Input testID={ID} />,
  Label: <kit.Label testID={ID}>Label</kit.Label>,
  ListItem: <kit.ListItem testID={ID} title="Row" />,
  ListItemsEmptyState: <kit.ListItemsEmptyState testID={ID} />,
  ListPicker: (
    <kit.ListPicker
      lists={[]}
      onCreate={noop}
      onToggle={noop}
      open
      testID={ID}
    />
  ),
  ListsEmptyState: <kit.ListsEmptyState testID={ID} />,
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
  NameOverlayToggle: (
    <kit.NameOverlayToggle checked onCheckedChange={noop} testID={ID} />
  ),
  NoResultsEmptyState: <kit.NoResultsEmptyState testID={ID} />,
  OfflineBanner: <kit.OfflineBanner online={false} testID={ID} />,
  PopoverContent: (
    <kit.Popover open>
      <kit.PopoverContent testID={ID} />
    </kit.Popover>
  ),
  ProgressBar: <kit.ProgressBar label="Progress" testID={ID} value={10} />,
  RadioGroup: <kit.RadioGroup options={OPTIONS} testID={ID} />,
  SearchField: <kit.SearchField testID={ID} />,
  SearchIdleEmptyState: <kit.SearchIdleEmptyState testID={ID} />,
  SearchResults: (
    <kit.SearchResults items={[]} onRetry={noop} state="idle" testID={ID} />
  ),
  SegmentedControl: (
    <kit.SegmentedControl
      onValueChange={noop}
      options={OPTIONS}
      testID={ID}
      value="one"
    />
  ),
  Select: <kit.Select options={OPTIONS} testID={ID} />,
  Separator: <kit.Separator testID={ID} />,
  ShareLink: (
    <kit.ShareLink
      access="view"
      onCopy={noop}
      onRevoke={noop}
      testID={ID}
      url="https://example.org/s"
    />
  ),
  SheetContent: (
    <kit.Sheet open>
      <kit.SheetContent testID={ID} title="Title" />
    </kit.Sheet>
  ),
  SheetFooter: <kit.SheetFooter testID={ID} />,
  Skeleton: <kit.Skeleton testID={ID} />,
  Spinner: <kit.Spinner testID={ID} />,
  Stepper: <kit.Stepper current={0} steps={[{ label: "One" }]} testID={ID} />,
  Surface: <kit.Surface testID={ID} />,
  SponsorEndCard: <kit.SponsorEndCard name="Jan" testID={ID} />,
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
  TextLink: (
    <kit.TextLink onPress={noop} testID={ID}>
      Link
    </kit.TextLink>
  ),
  Toggle: <kit.Toggle testID={ID}>Bold</kit.Toggle>,
  ToggleGroup: <kit.ToggleGroup testID={ID} />,
  ToggleGroupItem: (
    <kit.ToggleGroup>
      <kit.ToggleGroupItem testID={ID} value="a">
        A
      </kit.ToggleGroupItem>
    </kit.ToggleGroup>
  ),
  VideoPlayer: <kit.VideoPlayer playbackId="pb" testID={ID} />,
};
