import { expect, it, jest } from "@jest/globals";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { HOND, renderApp } from "../../../support/mobile/harness";

jest.mock("@smog/auth/expo", () => ({ createExpoAuthClient: jest.fn() }));
jest.mock("../../../../../apps/mobile/global.css", () => ({}));
jest.mock("nativewind", () => ({
  ...jest.requireActual<typeof import("nativewind")>("nativewind"),
  useColorScheme: () => ({
    colorScheme: "light",
    setColorScheme: () => undefined,
    toggleColorScheme: () => undefined,
  }),
}));

it("keeps the import result available after the guest data is cleared", async () => {
  const { clients } = await renderApp({
    guest: {
      favorites: [HOND.id],
      lists: [],
      preferences: { importDismissedFor: [], locale: "en", theme: "light" },
    },
    routes: {
      "account/importGuestData": {
        favoritesAdded: 1,
        itemsAdded: 0,
        itemsOverLimit: 0,
        lists: [],
        listsCreated: 0,
        listsMerged: 0,
        listsOverLimit: 0,
        skippedUnknownGestures: 0,
      },
      "favorites/ids": [],
      "favorites/list": { items: [], nextCursor: null },
    },
    signedIn: true,
  });
  fireEvent.press(await screen.findByRole("button", { name: "Import" }));
  expect(
    await screen.findByText("Your favorites and lists are now in your account.")
  ).toBeOnTheScreen();
  fireEvent.press(screen.getByRole("button", { name: "Done" }));
  await waitFor(() => {
    expect(screen.queryByText("Bring your data along?")).toBeNull();
  });
  clients.queryClient.clear();
});
