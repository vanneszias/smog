import { expect, test } from "@playwright/test";
import { signInWithApi, stubMux, waitForApp } from "./helpers";

test("a guest's favorite survives a reload and moves to the new account", async ({
  page,
}) => {
  await stubMux(page);
  await page.route("https://stream.mux.com/**", (route) => route.abort());

  // A guest hearts a gesture: it lives on the device.
  await page.goto("/gestures/kat");
  await waitForApp(page);
  const heart = page
    .getByRole("main")
    .getByRole("button", { exact: true, name: "Favoriet" })
    .first();
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await waitForApp(page);
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await page.goto("/favorites");
  await waitForApp(page);
  await expect(page.getByRole("link", { name: "Kat" })).toBeVisible();

  // Sign up with an email code (read from /dev/mail.json), then import.
  await signInWithApi(page);
  await page.reload();
  await waitForApp(page);
  const sheet = page.getByRole("dialog", { name: "Je gegevens meenemen?" });
  await expect(sheet.getByText("1 favoriet importeren?")).toBeVisible();
  await sheet.getByRole("button", { name: "Importeren" }).click();
  await expect(
    sheet.getByText("Je favorieten en lijsten staan nu in je account.")
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Klaar" }).click();

  // The device is cleared; the favorites page reads the account.
  const stored = await page.evaluate(() =>
    localStorage.getItem("smog:guest:v1")
  );
  expect(JSON.parse(stored ?? "{}").favorites).toEqual([]);
  const fromServer = page.waitForResponse((response) =>
    response.url().includes("/api/rpc/favorites/list")
  );
  await page.goto("/favorites");
  await waitForApp(page);
  await fromServer;
  await expect(page.getByRole("link", { name: "Kat" })).toBeVisible();
});

test("sign-out after the import never brings the guest's favorites back, and another account sees none", async ({
  page,
}) => {
  await stubMux(page);
  await page.route("https://stream.mux.com/**", (route) => route.abort());
  const heart = page
    .getByRole("main")
    .getByRole("button", { exact: true, name: "Favoriet" })
    .first();

  // A guest favorite, imported into account A.
  await page.goto("/gestures/kat");
  await waitForApp(page);
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await signInWithApi(page);
  await page.reload();
  await waitForApp(page);
  const sheet = page.getByRole("dialog", { name: "Je gegevens meenemen?" });
  await sheet.getByRole("button", { name: "Importeren" }).click();
  await sheet.getByRole("button", { name: "Klaar" }).click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");

  // Sign out from the user menu: a guest again, with an empty device.
  await page.getByRole("button", { name: "Accountmenu" }).click();
  await page.getByRole("menuitem", { name: "Afmelden" }).click();
  await expect(page.getByText("Je bent afgemeld.").first()).toBeVisible();
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await page.goto("/favorites");
  await waitForApp(page);
  await expect(page.getByText("Nog geen favorieten")).toBeVisible();
  await expect(page.getByRole("link", { name: "Kat" })).toHaveCount(0);

  // Account B in the same browser: none of A's favorites.
  await signInWithApi(page);
  const fromServer = page.waitForResponse((response) =>
    response.url().includes("/api/rpc/favorites/list")
  );
  await page.reload();
  await waitForApp(page);
  await fromServer;
  await expect(page.getByText("Nog geen favorieten")).toBeVisible();
  await expect(page.getByRole("link", { name: "Kat" })).toHaveCount(0);
  await page.goto("/gestures/kat");
  await waitForApp(page);
  await expect(heart).toHaveAttribute("aria-pressed", "false");
});
