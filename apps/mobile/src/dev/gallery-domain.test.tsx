import { describe, expect, it } from "@jest/globals";
import { createI18n } from "@smog/i18n";
import { I18nextProvider } from "@smog/i18n/react";
import { KitProvider, ToastProvider } from "@smog/ui-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { DomainGallery } from "./gallery-domain";

const i18n = createI18n("en");

async function renderGallery(): Promise<void> {
  await render(
    <I18nextProvider i18n={i18n}>
      <KitProvider>
        <ToastProvider>
          <DomainGallery />
        </ToastProvider>
      </KitProvider>
    </I18nextProvider>
  );
}

describe("DomainGallery", () => {
  it("shows every domain section", async () => {
    await renderGallery();
    for (const section of [
      "GestureCard / GestureGrid",
      "GestureRow",
      "CategoryChips",
      "FavoriteButton",
      "VideoPlayer / CourseBanner",
      "ListPicker",
      "ShareLink",
      "SearchResults",
      "FavoritesEmptyState / ListsEmptyState / ListItemsEmptyState / SearchIdleEmptyState",
    ]) {
      expect(screen.getByRole("header", { name: section })).toBeOnTheScreen();
    }
  });

  it("the sample cards toggle their hearts", async () => {
    await renderGallery();
    const [first] = screen.getAllByRole("togglebutton", {
      name: i18n.t("a11y.favorite"),
    });
    if (!first) {
      throw new Error("No favorite toggle rendered");
    }
    expect(first.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(first);
    expect(first.props.accessibilityState).toMatchObject({ checked: true });
  });

  it("opens the ListPicker sheet", async () => {
    await renderGallery();
    await fireEvent.press(
      screen.getByRole("button", { name: i18n.t("lists.addToList") })
    );
    expect(
      screen.getByRole("checkbox", {
        name: i18n.t("devTools.gallery.listSchool"),
      })
    ).toBeOnTheScreen();
  });
});
