import { expect, type Page, test } from "@playwright/test";
import { signInWithApi, stubMux, waitForApp } from "./helpers";

const LIST_NAME = "E2E klas";
const LIST_URL = /\/lists\?id=/;
const SHARE_URL = /\/lists\/[\w-]+$/;
const REMOVE = /verwijderen$/;
const DRAG = /^Slepen/;

async function saveToList(page: Page, slug: string): Promise<void> {
  await page.goto(`/gestures/${slug}`);
  await waitForApp(page);
  await page.getByRole("button", { name: "Opslaan in lijst" }).click();
  const picker = page.getByRole("dialog", { name: "Opslaan in lijst" });
  const option = picker.getByRole("checkbox", { name: LIST_NAME });
  await option.click();
  await expect(option).toBeChecked();
  await expect(
    page.getByText(`Toegevoegd aan “${LIST_NAME}”`, { exact: true })
  ).toBeVisible();
  await picker.getByRole("button", { name: "Sluiten" }).click();
}

function rowNames(page: Page) {
  return page.getByRole("main").getByRole("listitem").getByRole("link");
}

test("create a list, add gestures, reorder with the keyboard and share a view link", async ({
  browser,
  page,
}) => {
  await stubMux(page);
  await page.route("https://stream.mux.com/**", (route) => route.abort());
  await signInWithApi(page);

  await page.goto("/lists");
  await waitForApp(page);
  await page.getByRole("button", { name: "Nieuwe lijst" }).click();
  const form = page.getByRole("dialog", { name: "Nieuwe lijst" });
  await form.getByRole("textbox", { name: "Naam" }).fill(LIST_NAME);
  await form.getByRole("button", { name: "Aanmaken" }).click();
  await expect(page).toHaveURL(LIST_URL);
  const listUrl = page.url();

  // One after another: each opens its own gesture page.
  await saveToList(page, "hond");
  await saveToList(page, "kat");
  await saveToList(page, "paard");

  await page.goto(listUrl);
  await waitForApp(page);
  const detail = page.getByRole("region", { name: LIST_NAME });
  const links = detail.getByRole("listitem").getByRole("link");
  await expect(links).toHaveText(["Hond", "Kat", "Paard"]);

  // Keyboard reorder: pick up Hond, move it down one, drop it.
  const handle = detail.getByRole("button", {
    name: "Slepen om de volgorde te wijzigen: Hond",
  });
  const saved = page.waitForResponse((response) =>
    response.url().includes("/api/rpc/lists/reorder")
  );
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowDown");
  // dnd-kit announces each step; drop once the move is announced.
  await expect(
    page.getByText("Hond verplaatst naar positie 2 van 3.")
  ).toBeAttached();
  await page.keyboard.press("Space");
  await expect(links).toHaveText(["Kat", "Hond", "Paard"]);
  // Saved on the server: a reload keeps the order.
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await waitForApp(page);
  await expect(links).toHaveText(["Kat", "Hond", "Paard"]);

  // Share a view link.
  await detail.getByRole("button", { name: "Delen" }).click();
  const sheet = page.getByRole("dialog", { name: "Lijst delen" });
  await sheet
    .getByRole("button", { name: "Link om te bekijken maken" })
    .click();
  const link = sheet.getByRole("textbox").first();
  await expect(link).toHaveValue(SHARE_URL);
  const shareUrl = await link.inputValue();

  // Someone else opens it: view only, no edit controls.
  const guest = await browser.newContext({ locale: "nl-BE" });
  const viewer = await guest.newPage();
  await stubMux(viewer);
  await viewer.goto(shareUrl);
  await expect(
    viewer.getByRole("heading", { level: 1, name: LIST_NAME })
  ).toBeVisible();
  await expect(viewer.getByText("Alleen bekijken")).toBeVisible();
  await expect(rowNames(viewer)).toHaveText(["Kat", "Hond", "Paard"]);
  await expect(
    viewer.getByRole("button", { name: "Gebaren toevoegen" })
  ).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: REMOVE })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: DRAG })).toHaveCount(0);
  await guest.close();
});
