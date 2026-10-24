import { type APIRequestContext, expect, test } from "@playwright/test";
import { adminRpc, openAdmin, stubMuxMedia } from "./admin";
import { blockingViolations, e2eSeed, ORIGIN, signInWithApi } from "./helpers";
import { signInAsAdmin } from "./maintenance";

/*
 * The teacher information of a gesture (phase 10c task 2), in Belgian Dutch:
 * a teacher fills a field in French and finds it after a reload, a second
 * editor's save is offered as a conflict, a translator can read but not edit
 * the Dutch tab (and the server refuses the write), and the tabs pass axe.
 * The gesture is the spec's own and hidden; its teaching rows go with it.
 */

const SAMPLE_PLAYBACK_ID = "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";

function letters(length: number): string {
  return Array.from(
    { length },
    () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]
  ).join("");
}

const WORD = `ti${letters(8)}`;
const HC_LABEL = /^HC \(handconfiguratie\)/;
const PL_LABEL = /^PL \(plaats\)/;
const FRENCH_TAB = /Français/;
const ENGLISH_TAB = /English/;
const DUTCH_TAB = /Nederlands/;
const SAVE = "Lesgeversinfo opslaan";

let gestureId = "";

const EMPTY = {
  bw: "",
  cNote: "",
  hc: "",
  note: "",
  or: "",
  pl: "",
  summary: "",
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await signInAsAdmin(request);
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
  gestureId = gesture.id;
});

test.afterAll(async ({ request }) => {
  if (!gestureId) {
    return;
  }
  await signInAsAdmin(request);
  await adminRpc(request, "admin/gestures/delete", {
    confirmName: `Zz ${WORD}`,
    id: gestureId,
  });
  gestureId = "";
});

/** A signed-in account holding `role`, in this page's cookie jar. */
async function signedInAs(
  page: import("@playwright/test").Page,
  role: "teacher" | "translator"
): Promise<void> {
  const email = await signInWithApi(page);
  await e2eSeed(page.request, [{ email, op: "grantRole", role }]);
}

async function saveAsAdmin(
  request: APIRequestContext,
  locale: string,
  hc: string,
  expectedVersion: number | null
): Promise<void> {
  await signInAsAdmin(request);
  await adminRpc(request, "teacher/saveInfo", {
    expectedVersion,
    fields: { ...EMPTY, hc },
    gestureId,
    locale,
  });
}

test("a teacher fills a field in French and sees it after a reload", async ({
  page,
}) => {
  await stubMuxMedia(page);
  await signedInAs(page, "teacher");
  await openAdmin(page, `/admin/teacher-info/${gestureId}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Info voor lesgevers" })
  ).toBeVisible();
  // The default language first; the French tab is still empty.
  const tabs = page.getByRole("tab");
  await expect(tabs.first()).toContainText("Nederlands");
  const french = page.getByRole("tab", { name: FRENCH_TAB });
  await expect(french.getByText("Leeg")).toBeVisible();
  await french.click();
  const panel = page.getByRole("tabpanel", { name: FRENCH_TAB });
  await expect(panel.getByText("Referentie (Nederlands)")).toBeVisible();
  await panel.getByRole("textbox", { name: HC_LABEL }).fill("main plate");
  await panel
    .getByRole("textbox", { name: PL_LABEL })
    .fill("devant la poitrine");
  await panel.getByRole("button", { name: SAVE }).click();
  await expect(page.getByText("Lesgeversinfo opgeslagen.")).toBeVisible();
  await expect(french.getByText("Ingevuld")).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);

  await page.reload();
  await waitForTabs(page);
  const again = page.getByRole("tab", { name: FRENCH_TAB });
  await expect(again.getByText("Ingevuld")).toBeVisible();
  await again.click();
  await expect(
    page
      .getByRole("tabpanel", { name: FRENCH_TAB })
      .getByRole("textbox", { name: HC_LABEL })
  ).toHaveValue("main plate");
});

async function waitForTabs(page: import("@playwright/test").Page) {
  await expect(page.getByRole("tab").first()).toBeVisible();
}

test("a second editor's save is offered as a conflict, and their version can be taken", async ({
  page,
  request,
}) => {
  await stubMuxMedia(page);
  await saveAsAdmin(request, "en", "eerste", null);
  await signedInAs(page, "teacher");
  await openAdmin(page, `/admin/teacher-info/${gestureId}`);
  const english = page.getByRole("tab", { name: ENGLISH_TAB });
  await english.click();
  const panel = page.getByRole("tabpanel", { name: ENGLISH_TAB });
  const hc = panel.getByRole("textbox", { name: HC_LABEL });
  await expect(hc).toHaveValue("eerste");

  // Somebody else saves the same language meanwhile (version 1 to 2).
  await saveAsAdmin(request, "en", "tweede", 1);

  await hc.fill("mijn tekst");
  await panel.getByRole("button", { name: SAVE }).click();
  await expect(panel.getByText("Iemand was je voor")).toBeVisible();
  await expect(panel.getByText("tweede")).toBeVisible();
  await expect(panel.getByRole("button", { name: SAVE })).toBeDisabled();
  await expect(hc).toHaveValue("mijn tekst");
  await panel.getByRole("button", { name: "Hun versie overnemen" }).click();
  await expect(hc).toHaveValue("tweede");
  expect(await blockingViolations(page)).toEqual([]);
});

test("a translator reads the Dutch tab but cannot edit it, and the server refuses the write", async ({
  page,
}) => {
  await stubMuxMedia(page);
  await signedInAs(page, "translator");
  await openAdmin(page, `/admin/teacher-info/${gestureId}`);
  // They start on a language they can write.
  await expect(page.getByRole("tab", { name: ENGLISH_TAB })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await page.getByRole("tab", { name: DUTCH_TAB }).click();
  const panel = page.getByRole("tabpanel", { name: DUTCH_TAB });
  await expect(
    panel.getByText(
      "alleen een lesgever of beheerder schrijft in het Nederlands"
    )
  ).toBeVisible();
  await expect(panel.getByRole("textbox", { name: HC_LABEL })).toHaveJSProperty(
    "readOnly",
    true
  );
  await expect(panel.getByRole("button", { name: SAVE })).toHaveCount(0);
  expect(await blockingViolations(page)).toEqual([]);

  const refused = await page.request.post("/api/rpc/teacher/saveInfo", {
    data: {
      json: {
        expectedVersion: null,
        fields: { ...EMPTY, hc: "nee" },
        gestureId,
        locale: "nl",
      },
    },
    headers: { origin: ORIGIN },
  });
  expect(refused.status()).toBe(403);
});

test("a plain learner has no teacher information: the screen is the 404 page and the procedure refuses", async ({
  page,
}) => {
  await signInWithApi(page);
  const response = await page.goto(`/admin/teacher-info/${gestureId}`);
  expect(response?.status()).toBe(404);
  const read = await page.request.post("/api/rpc/teacher/getInfo", {
    data: { json: { gestureId } },
    headers: { origin: ORIGIN },
  });
  expect(read.status()).toBe(403);
});
