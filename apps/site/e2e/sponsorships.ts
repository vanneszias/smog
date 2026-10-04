import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { adminRpc, openAdmin } from "./admin";
import { e2eSeed, ORIGIN } from "./helpers";

/*
 * Shared helpers of the admin sponsorship specs (phase 6 task 7): the
 * fixtures (checkouts seeded through `/dev/e2e-seed` `sponsorshipCheckout`)
 * and the detail page. No `expect` here (as `admin.ts`).
 */

const SAMPLE_PLAYBACK_ID = "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";
const DAY = 86_400_000;
const IN_REVIEW = {
  paymentStatus: "paid",
  status: "in_review",
  videoPlaybackId: SAMPLE_PLAYBACK_ID,
} as const;

/** Stores a logo through the public upload (the signed fallback in dev). */
async function uploadLogo(page: Page): Promise<string> {
  const body = await readFile(
    join(import.meta.dirname, "../public/icon-192.png")
  );
  const upload = await adminRpc<{
    headers: { "content-type": string };
    key: string;
    uploadUrl: string;
  }>(page.request, "sponsorships/uploadLogo", {
    contentType: "image/png",
    size: body.byteLength,
  });
  const response = await page.request.put(upload.uploadUrl, {
    data: body,
    headers: { ...upload.headers, origin: ORIGIN },
  });
  if (!response.ok()) {
    throw new Error(`[e2e] The logo upload answered ${response.status()}`);
  }
  return upload.key;
}

/**
 * The flow spec's gestures: its tests approve, request changes and mark
 * paid, so it seeds them fresh and resets them afterwards.
 */
const FLOW_SLUGS = ["vogel", "koffie", "eten", "drinken"] as const;

export const FLOW_IDS = {
  eten: "e2e-adm-eten-0",
  koffie: "e2e-adm-koffie-0",
  /** Its first render failed (`seedRenderFailed`, phase 7 task 7). */
  renderFailed: "e2e-adm-render-failed",
  vogel: "e2e-adm-vogel-0",
} as const;

/** The flow fixtures, fresh (the previous run's rows go first). */
export async function seedFlowFixtures(page: Page): Promise<void> {
  await e2eSeed(page.request, [
    { op: "resetSponsorships", slugs: [...FLOW_SLUGS] },
    {
      ...IN_REVIEW,
      displayName: "E2E Vogel",
      gestureSlugs: ["vogel"],
      id: "e2e-adm-vogel",
      op: "sponsorshipCheckout",
    },
    {
      ...IN_REVIEW,
      displayName: "E2E Koffie",
      gestureSlugs: ["koffie"],
      id: "e2e-adm-koffie",
      op: "sponsorshipCheckout",
    },
    {
      displayName: "E2E Eten",
      gestureSlugs: ["eten", "drinken"],
      id: "e2e-adm-eten",
      op: "sponsorshipCheckout",
      paymentStatus: "open",
      status: "awaiting_payment",
    },
  ]);
}

/** The retry spec's own gesture and category, made by `seedRenderFailed`. */
export interface RenderFailedFixture {
  categoryId: string;
  gestureId: string;
  gestureName: string;
  slug: string;
}

/**
 * A `render_failed` sponsorship (`FLOW_IDS.renderFailed`, with its failed
 * first job) on a gesture of its own: an unpublished gesture and category
 * made for this run, so no other spec ever sees its sponsorship move
 * (task 7 review M-6). Needs an admin session; `removeRenderFailed` undoes it.
 */
export async function seedRenderFailed(
  page: Page
): Promise<RenderFailedFixture> {
  const word = crypto
    .randomUUID()
    .slice(0, 8)
    .replace(/[^a-z]/g, "q");
  const category = await adminRpc<{ id: string }>(
    page.request,
    "admin/categories/create",
    { name: `Zzcat render ${word}`, published: false }
  );
  const gesture = await adminRpc<{ id: string; name: string; slug: string }>(
    page.request,
    "admin/gestures/create",
    {
      categoryIds: [category.id],
      name: `Zzrender ${word}`,
      playbackId: SAMPLE_PLAYBACK_ID,
      published: false,
    }
  );
  await e2eSeed(page.request, [
    {
      displayName: "E2E Render",
      gestureSlug: gesture.slug,
      id: FLOW_IDS.renderFailed,
      op: "sponsorship",
      status: "render_failed",
    },
  ]);
  return {
    categoryId: category.id,
    gestureId: gesture.id,
    gestureName: gesture.name,
    slug: gesture.slug,
  };
}

/** Its sponsorship (with jobs and trail), then the gesture and the category. */
export async function removeRenderFailed(
  page: Page,
  fixture: RenderFailedFixture
): Promise<void> {
  await e2eSeed(page.request, [
    { op: "resetSponsorships", slugs: [fixture.slug] },
  ]);
  await adminRpc(page.request, "admin/gestures/delete", {
    confirmName: fixture.gestureName,
    id: fixture.gestureId,
  });
  await adminRpc(page.request, "admin/categories/delete", {
    id: fixture.categoryId,
  });
}

export async function resetFlowFixtures(page: Page): Promise<void> {
  await e2eSeed(page.request, [
    { op: "resetSponsorships", slugs: [...FLOW_SLUGS] },
  ]);
}

/**
 * The accessibility spec's gestures, one per state it shows. Nothing
 * writes to them, so its parallel tests share them: they are seeded once
 * (by whichever worker is first) and kept between runs, never reset while
 * another worker may be reading them.
 */
export const VIEW_IDS = {
  appel: "e2e-adm-appel-0",
  bang: "e2e-adm-bang-0",
  dag: "e2e-adm-dag-0",
  hallo: "e2e-adm-hallo-0",
} as const;

async function viewFixturesExist(page: Page): Promise<boolean> {
  try {
    await adminRpc(page.request, "admin/sponsorships/get", {
      id: VIEW_IDS.bang,
    });
    return true;
  } catch {
    return false;
  }
}

/** Seeds the view fixtures unless they are there (needs an admin session). */
export async function ensureViewFixtures(page: Page): Promise<void> {
  if (await viewFixturesExist(page)) {
    return;
  }
  const logoKey = await uploadLogo(page);
  try {
    await e2eSeed(page.request, [
      { op: "resetSponsorships", slugs: ["appel", "bang", "hallo", "dag"] },
      {
        ...IN_REVIEW,
        displayName: "Bakkerij Hallo",
        gestureSlugs: ["hallo"],
        id: "e2e-adm-hallo",
        invoice: true,
        logo: true,
        logoKey,
        op: "sponsorshipCheckout",
      },
      {
        displayName: "E2E Dag",
        gestureSlugs: ["dag"],
        id: "e2e-adm-dag",
        invoice: true,
        op: "sponsorshipCheckout",
        paymentStatus: "open",
        status: "awaiting_payment",
      },
      {
        displayName: "E2E Appel",
        endsAt: Date.now() + 200 * DAY,
        gestureSlugs: ["appel"],
        id: "e2e-adm-appel",
        op: "sponsorshipCheckout",
        paymentStatus: "paid",
        status: "live",
        videoPlaybackId: SAMPLE_PLAYBACK_ID,
      },
      {
        displayName: "E2E Bang",
        gestureSlugs: ["bang"],
        id: "e2e-adm-bang",
        op: "sponsorshipCheckout",
        paymentStatus: "refund_needed",
        status: "cancelled",
      },
    ]);
  } catch (error) {
    // Another worker seeded them at the same moment (the ids are fixed).
    if (!(await viewFixturesExist(page))) {
      throw error;
    }
  }
}

/**
 * Opens a sponsorship's detail and waits for its data (the payments
 * heading), not for the network to idle: the stubbed Mux player keeps
 * retrying. `settle` also waits for idle (the screenshots).
 */
export async function openDetail(
  page: Page,
  id: string,
  { settle = false }: { settle?: boolean } = {}
): Promise<void> {
  await openAdmin(page, `/admin/sponsorships/${id}`);
  await page.getByRole("heading", { level: 2, name: "Betalingen" }).waitFor();
  if (settle) {
    await page.waitForLoadState("networkidle");
  }
}
