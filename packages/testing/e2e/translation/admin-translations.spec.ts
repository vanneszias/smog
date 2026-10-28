import { type APIRequestContext, expect, test } from "@playwright/test";
import { adminRpc, openAdmin, stubMuxMedia } from "../../support/e2e/admin";
import { blockingViolations } from "../../support/e2e/helpers";
import { signInAsAdmin } from "../../support/e2e/maintenance";

/*
 * The gesture and category translations in the admin (phase 10b task 5),
 * in Belgian Dutch, as the seeded admin: a gesture of the spec's own (hidden,
 * so no visitor sees it) needs a French translation, the report and the
 * list filter say so, the editor's French tab saves it with the lock, and
 * the filter then no longer lists it; a category of its own gets a French
 * name in the categories screen. Everything the test creates is deleted again
 * (the translations go with their gesture or category).
 */

const SAMPLE_PLAYBACK_ID = "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";

function letters(length: number): string {
  return Array.from(
    { length },
    () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]
  ).join("");
}

const WORD = `tr${letters(8)}`;

interface Made {
  categoryId: string;
  gestureId: string;
  ownCategoryId: string;
}

let made: Made | null = null;

async function create(request: APIRequestContext): Promise<Made> {
  const categories = await adminRpc<
    { id: string; publishedAt: number | null }[]
  >(request, "admin/categories/list");
  const seeded = categories.find((item) => item.publishedAt !== null);
  if (!seeded) {
    throw new Error("[e2e] the dev seed has no published category");
  }
  const gesture = await adminRpc<{ id: string }>(
    request,
    "admin/gestures/create",
    {
      categoryIds: [seeded.id],
      name: `Zz ${WORD}`,
      playbackId: SAMPLE_PLAYBACK_ID,
      published: false,
    }
  );
  const own = await adminRpc<{ id: string }>(
    request,
    "admin/categories/create",
    { name: `Zz categorie ${WORD}`, published: false }
  );
  return {
    categoryId: seeded.id,
    gestureId: gesture.id,
    ownCategoryId: own.id,
  };
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await signInAsAdmin(request);
  made = await create(request);
});

test.afterAll(async ({ request }) => {
  if (!made) {
    return;
  }
  await signInAsAdmin(request);
  await adminRpc(request, "admin/gestures/delete", {
    confirmName: `Zz ${WORD}`,
    id: made.gestureId,
  });
  await adminRpc(request, "admin/categories/delete", {
    id: made.ownCategoryId,
  });
  made = null;
});

test("the filter lists what needs French, the editor's French tab saves it, the filter lets go of it", async ({
  page,
}) => {
  await stubMuxMedia(page);
  await signInAsAdmin(page.request);

  // The report and the list filter.
  await openAdmin(page, `/admin/gestures?needs=fr&q=${WORD}`);
  await expect(
    page.getByRole("link", { name: `Zz ${WORD}` }).first()
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Vertalingen per taal" })
  ).toBeVisible();
  await expect(
    page.getByText("gebaren hebben een vertaling nodig").first()
  ).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);

  // The editor: the Dutch text beside the French fields.
  await openAdmin(page, `/admin/gestures/${made?.gestureId}`);
  const card = page.locator("#translations");
  await expect(
    card.getByRole("heading", { name: "Vertalingen" })
  ).toBeVisible();
  await expect(
    card.getByRole("tabpanel").getByText("Bron (Nederlands)")
  ).toBeVisible();
  const french = card.getByRole("tab", { name: "Français" });
  await expect(french.getByText("Vertaling nodig")).toBeVisible();
  await french.click();
  await card
    .getByRole("textbox", { name: "Naam in Français" })
    .fill(`Zz ${WORD} fr`);
  await card.getByRole("button", { name: "Vertaling opslaan" }).click();
  await expect(page.getByText("Vertaling opgeslagen.")).toBeVisible();
  await expect(french.getByText("Vertaald")).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);

  // Translated: the filter no longer lists it.
  await openAdmin(page, `/admin/gestures?needs=fr&q=${WORD}`);
  await expect(page.getByText("Geen gebaren gevonden")).toBeVisible();
});

test("a category's French name is saved from the categories screen", async ({
  page,
}) => {
  await signInAsAdmin(page.request);
  await openAdmin(page, "/admin/categories");
  await page.getByRole("tab", { name: "Français" }).click();
  const name = `Zz categorie ${WORD}`;
  const field = page.getByRole("textbox", {
    name: `Naam in Français: ${name}`,
  });
  await expect(field).toBeVisible();
  await field.fill(`Catégorie ${WORD}`);
  await page
    .getByRole("button", { name: `Vertaling van ${name} opslaan` })
    .click();
  await expect(page.getByText("Naam opgeslagen.")).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);
});
