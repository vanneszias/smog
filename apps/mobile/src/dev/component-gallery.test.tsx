import { describe, expect, it, jest } from "@jest/globals";
import { createI18n } from "@smog/i18n";
import { I18nextProvider } from "@smog/i18n/react";
import { KitProvider, ToastProvider } from "@smog/ui-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

const mockSetColorScheme = jest.fn();

jest.mock("nativewind", () => {
  const actual = jest.requireActual<typeof import("nativewind")>("nativewind");
  return {
    ...actual,
    useColorScheme: () => ({
      colorScheme: "light",
      setColorScheme: mockSetColorScheme,
      toggleColorScheme: jest.fn(),
    }),
  };
});

// Imported after the mock so the gallery sees the mocked hook.
const { ComponentGallery } =
  require("./component-gallery") as typeof import("./component-gallery");

const i18n = createI18n("en");

async function renderGallery(): Promise<void> {
  await render(
    <I18nextProvider i18n={i18n}>
      <KitProvider>
        <ToastProvider>
          <ComponentGallery />
        </ToastProvider>
      </KitProvider>
    </I18nextProvider>
  );
}

describe("ComponentGallery", () => {
  it("shows every section of the kit", async () => {
    await renderGallery();
    expect(
      screen.getByRole("header", { name: i18n.t("devTools.componentGallery") })
    ).toBeOnTheScreen();
    for (const section of [
      "Button",
      "IconButton",
      "Heading / Text",
      "Badge",
      "Chip",
      "Field / Input / Textarea / SearchField / Select",
      "Checkbox / Switch / RadioGroup",
      "Card",
      "ListItem",
      "Avatar",
      "Tabs",
      "SegmentedControl",
      "Dialog / AlertDialog / Sheet / Menu / Toast",
      "Skeleton / EmptyState / ErrorState / OfflineBanner",
      "Spinner / ProgressBar / Stepper",
      "Logo",
    ]) {
      expect(screen.getByRole("header", { name: section })).toBeOnTheScreen();
    }
  });

  it("switches the theme", async () => {
    await renderGallery();
    // The toggle comes first; the RadioGroup sample repeats the theme names.
    const [toggleDark] = screen.getAllByRole("radio", {
      name: i18n.t("theme.dark"),
    });
    if (!toggleDark) {
      throw new Error("The theme toggle is missing");
    }
    await fireEvent.press(toggleDark);
    expect(mockSetColorScheme).toHaveBeenCalledWith("dark");
  });
});
