import { describe, expect, it } from "@jest/globals";
import { screen } from "@testing-library/react-native";
// biome-ignore lint/performance/noNamespaceImport: the test walks every export of the kit
import * as kit from "./index";
import { CASES, ID } from "./test/kit-cases";
import { renderKit } from "./test/render";

const COMPONENT_NAME = /^[A-Z]/;

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
      "Popover",
      "PopoverClose",
      "PopoverTrigger",
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

/**
 * `@smog/ui-web`'s runtime exports when phase 10a began (its `src/index.ts`
 * at e690544), and why each one that the native kit does not have is web
 * only. A name the web kit adds later (phase 10a task 2: command, carousel,
 * hover-card, sidebar, collapsible, sonner's toaster, ...) is added to the
 * first list when it has a native counterpart, otherwise to `WEB_ONLY`, in
 * the same change that adds it to the native kit's API.md.
 */
const WEB_KIT = [
  "AlertDialog",
  "AudioButton",
  "Avatar",
  "Badge",
  "Button",
  "Card",
  "CardContent",
  "CardDescription",
  "CardFooter",
  "CardHeader",
  "CardTitle",
  "CategoryChips",
  "Checkbox",
  "Chip",
  "ConsentBanner",
  "CourseBanner",
  "Dialog",
  "DialogClose",
  "DialogContent",
  "DialogFooter",
  "DialogTrigger",
  "EmptyState",
  "ErrorState",
  "FavoriteButton",
  "FavoritesEmptyState",
  "Field",
  "GestureCard",
  "GestureGrid",
  "GestureRow",
  "Heading",
  "IconButton",
  "Input",
  "ListItem",
  "ListItemsEmptyState",
  "ListPicker",
  "ListsEmptyState",
  "Logo",
  "Menu",
  "MenuContent",
  "MenuGroup",
  "MenuItem",
  "MenuLabel",
  "MenuSeparator",
  "MenuTrigger",
  "NameOverlayToggle",
  "NoResultsEmptyState",
  "OfflineBanner",
  "ProgressBar",
  "RadioGroup",
  "SearchField",
  "SearchIdleEmptyState",
  "SearchResults",
  "SegmentedControl",
  "Select",
  "ShareLink",
  "Sheet",
  "SheetClose",
  "SheetContent",
  "SheetFooter",
  "SheetTrigger",
  "Skeleton",
  "Spinner",
  "SponsorEndCard",
  "Stepper",
  "Switch",
  "Tabs",
  "TabsContent",
  "TabsList",
  "TabsTrigger",
  "Text",
  "TextLink",
  "Textarea",
  "ToastProvider",
  "VideoPlayer",
  "badgeVariants",
  "buttonVariants",
  "cn",
  "useFieldControl",
  "useToast",
];

const WEB_ONLY: Record<string, string> = {
  AppBanner: "a web page banner (the app has its own screens)",
  AuthSidePanel:
    "a web auth page decoration (the app's sign-in is its own screen)",
  DataTable: "admin is web only",
  Empty:
    "registry empty parts compose EmptyState on web; native keeps EmptyState",
  EmptyContent: "registry empty part (web composition of EmptyState)",
  EmptyDescription: "registry empty part (web composition of EmptyState)",
  EmptyHeader: "registry empty part (web composition of EmptyState)",
  EmptyMedia: "registry empty part (web composition of EmptyState)",
  EmptyTitle: "registry empty part (web composition of EmptyState)",
  HandIllustration:
    "web draws the brand hands inline; native EmptyState renders its own",
  KitLinkComponent: "router links: native navigates in onPress",
  OpenInAppBanner: "opens the app from the web",
  Pagination: "lists load more on scroll",
  PortalContainerProvider: "native overlays re-apply the theme themselves",
  Table: "admin is web only",
  TableBody: "admin is web only",
  TableCaption: "admin is web only",
  TableCell: "admin is web only",
  TableHead: "admin is web only",
  TableHeader: "admin is web only",
  TableRow: "admin is web only",
  Tooltip: "no hover on a touch screen",
  TooltipProvider: "no hover on a touch screen",
  textLinkVariants: "styles a web anchor (asChild)",
  useOnline: "the app passes NetInfo",
};

/** Names only the native kit has, and what they are for. */
const NATIVE_ONLY: Record<string, string> = {
  KitProvider: "gesture root and bottom sheet provider",
  Surface: "a green surface: on-green colours for the kit inside it",
  useColor: "a colour role as a value (no currentColor)",
  useLineLimit: "large text wraps instead of being cut off",
  useSurface: "the tone of the nearest Surface",
  useThemeName: "the active scheme",
  useThemeVars: "the colour variables for an overlay root",
};

describe("parity with @smog/ui-web", () => {
  const native = new Set(
    Object.entries(kit)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name)
  );

  it("has every web export that is not web only", () => {
    expect(WEB_KIT.filter((name) => !native.has(name))).toEqual([]);
  });

  it("names a reason for every web export it lacks, and no stale ones", () => {
    for (const name of Object.keys(WEB_ONLY)) {
      expect(native.has(name)).toBe(false);
      expect(WEB_KIT).not.toContain(name);
    }
  });

  it("documents every native export as shared or native only", () => {
    const known = new Set([...WEB_KIT, ...Object.keys(NATIVE_ONLY)]);
    // Primitives added with phase 10a (the Reusables set), also in ui-web
    // from task 2 on; they are listed here until `WEB_KIT` is refreshed.
    const REUSABLES = new Set([
      "Accordion",
      "AccordionContent",
      "AccordionItem",
      "AccordionTrigger",
      "Alert",
      "AlertDescription",
      "AlertTitle",
      "Label",
      "Popover",
      "PopoverClose",
      "PopoverContent",
      "PopoverTrigger",
      "Separator",
      "Toggle",
      "ToggleGroup",
      "ToggleGroupItem",
    ]);
    expect(
      [...native].filter((n) => !(known.has(n) || REUSABLES.has(n)))
    ).toEqual([]);
  });
});
