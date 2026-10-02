import { expect, test } from "@playwright/test";
import { signInWithApi, stubMux, watchErrors } from "./helpers";

/** A guest's device data (local-store v2) with one favorite no catalogue has. */
const GUEST_DATA = {
  consent: { analytics: null },
  favorites: ["e2e-unknown-gesture"],
  lists: [],
  preferences: { importDismissedFor: [], locale: null, theme: "system" },
  recentSearches: [],
  version: 2,
};

test("offers the guest import after sign-in and shows the result", async ({
  page,
}) => {
  const errors = watchErrors(page);
  // The home page shows featured gestures (Mux stills).
  await stubMux(page);
  await page.addInitScript((data) => {
    localStorage.setItem("smog:guest:v1", data);
  }, JSON.stringify(GUEST_DATA));
  await signInWithApi(page);
  await page.goto("/");

  const sheet = page.getByRole("dialog", { name: "Je gegevens meenemen?" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("1 favoriet importeren?")).toBeVisible();
  await sheet.getByRole("button", { name: "Importeren" }).click();

  await expect(
    sheet.getByText("Je favorieten en lijsten staan nu in je account.")
  ).toBeVisible();
  // The favorite is unknown to the catalogue: skipped and counted.
  await expect(
    sheet.getByText("1 gebaar is niet meer beschikbaar en is overgeslagen.")
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Klaar" }).click();
  await expect(sheet).toBeHidden();
  expect(errors).toEqual([]);
});
