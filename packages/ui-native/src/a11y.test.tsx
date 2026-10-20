import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { type ReactElement, useCallback } from "react";
import {
  AccessibilityInfo,
  Dimensions,
  Platform,
  Pressable,
  Text,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
// biome-ignore lint/performance/noNamespaceImport: the audit names every export of the kit
import * as kit from "./index";
import { auditInteractive, formatFindings } from "./test/a11y-audit";
import { HELLO } from "./test/gestures";
import { CASES, ID } from "./test/kit-cases";
import { renderKit, t } from "./test/render";

/**
 * Phase 9 ruling 3, the mobile half: the kit's accessibility contract, held by
 * tests. What a machine cannot judge (a VoiceOver / TalkBack pass, dynamic
 * type on a device) is an owner action.
 */

/** Inputs need a name from somewhere: a Field, as in the app. */
const NAMED: Record<string, ReactElement> = {
  Input: (
    <kit.Field label="Name">
      <kit.Input testID={ID} />
    </kit.Field>
  ),
  Textarea: (
    <kit.Field label="Message">
      <kit.Textarea testID={ID} />
    </kit.Field>
  ),
};

/** Two buttons that fire a neutral and a danger toast. */
function ToastButtons(): ReactElement {
  const { toast } = kit.useToast();
  const ok = useCallback(() => toast({ title: "Saved" }), [toast]);
  const fail = useCallback(
    () => toast({ title: "Failed", variant: "danger" }),
    [toast]
  );
  return (
    <>
      <kit.Button onPress={ok}>Ok</kit.Button>
      <kit.Button onPress={fail}>Fail</kit.Button>
    </>
  );
}

describe("every kit component, audited", () => {
  it.each(Object.entries({ ...CASES, ...NAMED }))(
    "%s: a role, a name and a 44 pt target on every control",
    async (_name, element) => {
      await renderKit(element);
      expect(formatFindings(auditInteractive())).toEqual([]);
    }
  );

  it("catches a control without a role, a name or a 44 pt target", async () => {
    await renderKit(
      <>
        <Pressable accessibilityLabel="No role" onPress={jest.fn()} />
        <Pressable accessibilityRole="button" onPress={jest.fn()} />
        <Pressable
          accessibilityLabel="Tiny"
          accessibilityRole="button"
          onPress={jest.fn()}
          style={{ height: 20, width: 20 }}
        />
        <Pressable
          accessibilityLabel="Reaches 44"
          accessibilityRole="button"
          hitSlop={12}
          onPress={jest.fn()}
          style={{ height: 20, width: 20 }}
        />
        <Pressable
          accessibilityLabel="Icon only, no width"
          accessibilityRole="button"
          onPress={jest.fn()}
          style={{ height: 44 }}
        />
      </>
    );
    expect(formatFindings(auditInteractive())).toEqual([
      'View[no role] "No role": has no accessibilityRole',
      'View[no role] "No role": hit area is 0 pt high (needs 44)',
      'View[no role] "No role": an icon-only control must set its width',
      'View[button] "": has no accessible name',
      'View[button] "": hit area is 0 pt high (needs 44)',
      'View[button] "": an icon-only control must set its width',
      'View[button] "Tiny": hit area is 20 pt high (needs 44)',
      'View[button] "Tiny": hit area is 20 pt wide (needs 44)',
      'View[button] "Icon only, no width": an icon-only control must set its width',
    ]);
  });

  it("exempts a named control only when asked, with its reason", async () => {
    await renderKit(
      <Pressable
        accessibilityLabel="Inline"
        accessibilityRole="link"
        onPress={jest.fn()}
      />
    );
    expect(auditInteractive()).not.toEqual([]);
    expect(
      auditInteractive({ exemptTargets: { Inline: "inline in a sentence" } })
    ).toEqual([]);
  });
});

describe("states a screen reader reads", () => {
  it("a disabled or loading Button says so, a loading one is busy", async () => {
    await renderKit(
      <>
        <kit.Button disabled>Off</kit.Button>
        <kit.Button loading>Wait</kit.Button>
        <kit.IconButton disabled icon={<Text>x</Text>} label="Closed" />
      </>
    );
    expect(screen.getByRole("button", { name: "Off" })).toBeDisabled();
    const loading = screen.getByRole("button", { name: "Wait" });
    expect(loading).toBeDisabled();
    expect(loading.props.accessibilityState).toMatchObject({ busy: true });
    expect(screen.getByRole("button", { name: "Closed" })).toBeDisabled();
  });

  it("toggles expose checked, tabs and steps expose selected, a select expands", async () => {
    const onChange = jest.fn();
    await renderKit(
      <>
        <kit.Checkbox defaultChecked label="Box" />
        <kit.Checkbox checked="indeterminate" label="Mixed" />
        <kit.Switch label="Switch" />
        <kit.Chip onSelectedChange={onChange} selected>
          Chip
        </kit.Chip>
        <kit.RadioGroup
          options={[
            { label: "One", value: "one" },
            { disabled: true, label: "Two", value: "two" },
          ]}
          value="one"
        />
        <kit.SegmentedControl
          onValueChange={onChange}
          options={[
            { label: "Light", value: "light" },
            { label: "Dark", value: "dark" },
          ]}
          value="dark"
        />
        <kit.FavoriteButton active onToggle={onChange} />
        <kit.Tabs defaultValue="a">
          <kit.TabsList>
            <kit.TabsTrigger value="a">Tab A</kit.TabsTrigger>
            <kit.TabsTrigger disabled value="b">
              Tab B
            </kit.TabsTrigger>
          </kit.TabsList>
        </kit.Tabs>
        <kit.Select
          options={[{ label: "One", value: "one" }]}
          placeholder="Pick"
        />
      </>
    );
    const state = (role: string, name: string) =>
      screen.getByRole(role as never, { name }).props.accessibilityState;
    expect(state("checkbox", "Box")).toMatchObject({ checked: true });
    expect(state("checkbox", "Mixed")).toMatchObject({ checked: "mixed" });
    expect(state("switch", "Switch")).toMatchObject({ checked: false });
    expect(state("togglebutton", "Chip")).toMatchObject({ checked: true });
    expect(state("radio", "One")).toMatchObject({ checked: true });
    expect(state("radio", "Two")).toMatchObject({
      checked: false,
      disabled: true,
    });
    expect(state("radio", "Dark")).toMatchObject({ checked: true });
    expect(state("radio", "Light")).toMatchObject({ checked: false });
    expect(state("togglebutton", t("a11y.favorite"))).toMatchObject({
      checked: true,
    });
    expect(state("tab", "Tab A")).toMatchObject({ selected: true });
    expect(state("tab", "Tab B")).toMatchObject({
      disabled: true,
      selected: false,
    });
    expect(state("combobox", "Pick")).toMatchObject({ expanded: false });
  });

  it("a toggle's state follows a press", async () => {
    await renderKit(<kit.Switch label="Switch" />);
    await fireEvent.press(screen.getByRole("switch", { name: "Switch" }));
    expect(
      screen.getByRole("switch", { name: "Switch" }).props.accessibilityState
    ).toMatchObject({ checked: true });
  });

  it("a field marks its error as an alert in a live region", async () => {
    await renderKit(
      <kit.Field error="Required" label="Name">
        <kit.Input />
      </kit.Field>
    );
    const error = screen.getByText("Required");
    expect(error.props.accessibilityRole).toBe("alert");
    expect(error.props.accessibilityLiveRegion).toBe("polite");
  });
});

describe("modal focus", () => {
  function modalRoot(): { props: Record<string, unknown> } {
    return screen.getByTestId("overlay-theme-root");
  }

  it("a dialog keeps the screen reader inside", async () => {
    await renderKit(
      <kit.Dialog open>
        <kit.DialogContent title="Share list" />
      </kit.Dialog>
    );
    expect(modalRoot().props.accessibilityViewIsModal).toBe(true);
  });

  it("an alert dialog keeps the screen reader inside", async () => {
    await renderKit(
      <kit.AlertDialog onConfirm={jest.fn()} open title="Sure?" />
    );
    expect(modalRoot().props.accessibilityViewIsModal).toBe(true);
  });

  it.each([
    [
      "a sheet",
      <kit.Sheet key="s" open>
        <kit.SheetContent title="Sheet" />
      </kit.Sheet>,
    ],
    [
      "a select",
      <kit.Select
        defaultOpen
        key="se"
        options={[{ label: "One", value: "one" }]}
      />,
    ],
    [
      "a menu",
      <kit.Menu defaultOpen key="m">
        <kit.MenuContent>
          <kit.MenuItem>Item</kit.MenuItem>
        </kit.MenuContent>
      </kit.Menu>,
    ],
  ])("%s keeps the screen reader inside", async (_name, element) => {
    await renderKit(element);
    expect(modalRoot().props.accessibilityViewIsModal).toBe(true);
  });
});

describe("announcements", () => {
  it("toasts are live regions, danger ones assertive alerts, and are announced", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await renderKit(<ToastButtons />);
    await fireEvent.press(screen.getByRole("button", { name: "Ok" }));
    expect(announce).toHaveBeenLastCalledWith("Saved");
    expect(screen.getByText("Saved").parent?.parent?.props).toMatchObject({
      accessibilityLiveRegion: "polite",
    });
    await fireEvent.press(screen.getByRole("button", { name: "Fail" }));
    expect(announce).toHaveBeenLastCalledWith("Failed");
    expect(screen.getAllByTestId("toast").at(-1)?.props).toMatchObject({
      accessibilityLiveRegion: "assertive",
      accessibilityRole: "alert",
    });
    announce.mockRestore();
  });

  it("the offline banner and an error state are live regions", async () => {
    await renderKit(
      <>
        <kit.OfflineBanner online={false} testID="offline" />
        <kit.ErrorState testID="error" />
      </>
    );
    expect(screen.getByTestId("offline").props.accessibilityLiveRegion).toBe(
      "polite"
    );
    // One announcement: title and description in an alert; retry is apart.
    expect(screen.getByRole("alert").props.accessibilityLiveRegion).toBe(
      "assertive"
    );
  });
});

describe("search announcements", () => {
  function results(
    state: "empty" | "idle" | "loading" | "results"
  ): ReactElement {
    return (
      <kit.SearchResults
        items={[]}
        onRetry={jest.fn()}
        scrollEnabled={false}
        state={state}
      />
    );
  }

  async function announcements(os: "android" | "ios"): Promise<string[]> {
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);
    jest.replaceProperty(Platform, "OS", os);
    try {
      const { rerender, unmount } = await renderKit(results("loading"));
      await rerender(results("empty"));
      await rerender(results("results"));
      await unmount();
      return announce.mock.calls.map(([text]) => text);
    } finally {
      announce.mockRestore();
    }
  }

  it("iOS announces what a search did: searching, no results, the count", async () => {
    expect(await announcements("ios")).toEqual([
      t("search.searching"),
      t("search.noResults.title"),
      t("search.resultCount", { count: 0 }),
    ]);
  });

  it("Android announces searching and no results; the count is its live region", async () => {
    expect(await announcements("android")).toEqual([
      t("search.searching"),
      t("search.noResults.title"),
    ]);
    await renderKit(results("results"));
    expect(
      screen.getByText(t("search.resultCount", { count: 0 })).props
        .accessibilityLiveRegion
    ).toBe("polite");
  });
});

describe("reduced motion", () => {
  async function renderWith(
    reduced: boolean,
    element: ReactElement
  ): Promise<void> {
    jest.mocked(useReducedMotion).mockReturnValue(reduced);
    try {
      await renderKit(element);
    } finally {
      jest.mocked(useReducedMotion).mockReturnValue(false);
    }
  }

  it.each([
    [false, true],
    [true, false],
  ])(
    "with reduced motion %s a toast animates in: %s",
    async (reduced, animates) => {
      jest.mocked(useReducedMotion).mockReturnValue(reduced);
      try {
        await renderKit(<ToastButtons />);
        await fireEvent.press(screen.getByRole("button", { name: "Ok" }));
        const entering = screen.getByTestId("toast").parent?.props.entering;
        expect(entering !== undefined).toBe(animates);
      } finally {
        jest.mocked(useReducedMotion).mockReturnValue(false);
      }
    }
  );

  it.each([
    [false, "fade"],
    [true, "none"],
  ])(
    "with reduced motion %s a dialog's animation is %s",
    async (reduced, type) => {
      await renderWith(
        reduced,
        <kit.Dialog open>
          <kit.DialogContent title="Share list" />
        </kit.Dialog>
      );
      const modal = screen.root?.queryAll(
        (node) => node.props.animationType !== undefined
      )[0];
      expect(modal?.props.animationType).toBe(type);
    }
  );

  it("a gesture video does not start by itself", async () => {
    const { mockVideoPlayers } = jest.requireMock<{
      mockVideoPlayers: { muted: boolean; play: jest.Mock }[];
    }>("expo-video");
    await renderWith(
      true,
      <kit.VideoPlayer autoPlay loop playbackId="mux-reduced" />
    );
    const player = mockVideoPlayers.at(-1);
    expect(player?.play).not.toHaveBeenCalled();
    // Not muted either: the person who presses play wants the sound.
    expect(player?.muted).toBe(false);
    await screen.unmount();
    await renderWith(
      false,
      <kit.VideoPlayer autoPlay loop playbackId="mux-normal" />
    );
    expect(mockVideoPlayers.at(-1)?.play).toHaveBeenCalled();
    expect(mockVideoPlayers.at(-1)?.muted).toBe(true);
  });
});

describe("dynamic type", () => {
  async function lines(fontScale: number): Promise<unknown[]> {
    const window = Dimensions.get("window");
    Dimensions.set({ window: { ...window, fontScale } });
    try {
      const { unmount } = await renderKit(
        <>
          <kit.ListItem description="an@smog.test" title="An" />
          <kit.GestureRow gesture={HELLO} />
          <kit.GestureCard gesture={HELLO} />
        </>
      );
      const found = [
        screen.getByText("An"),
        screen.getByText("an@smog.test"),
        ...screen.getAllByText(HELLO.name),
      ].map((node) => node.props.numberOfLines);
      await unmount();
      return found;
    } finally {
      Dimensions.set({ window });
    }
  }

  it("names stay on one line at normal sizes", async () => {
    expect(await lines(1)).toEqual([1, 1, 1, 1]);
  });

  it("wrap instead of being cut off with an ellipsis in large text", async () => {
    expect(await lines(2)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
