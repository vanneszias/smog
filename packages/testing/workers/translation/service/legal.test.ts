import { env } from "cloudflare:workers";
import { legalPublishedSource } from "@smog/db";
import { type LegalDocument, legalDocument } from "@smog/i18n/legal";
import { loadLegalText } from "@smog/i18n/server";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  LegalDetail,
  LegalOverview,
  LegalVersion,
} from "../../../../features/translation/src/schema/index";
import {
  type Authed,
  addLanguage,
  auditMark,
  auditRowsSince,
  callAs,
  failureOf,
  i18nVersion,
  resetTranslationData,
  signedUp,
  testDb,
} from "./helpers";

let admin: Authed;
let translator: Authed;
let learner: Authed;

beforeAll(async () => {
  admin = await signedUp("admin");
  translator = await signedUp("translator");
  learner = await signedUp("user");
});

beforeEach(async () => {
  await resetTranslationData();
  await env.KV.delete("i18n:version");
});

const EFFECTIVE = "2026-11-01";

function edited(title: string): LegalDocument {
  const base = legalDocument("en", "terms");
  return { ...base, title };
}

const detail = (as: Authed, kind: string, locale: string) =>
  callAs<LegalDetail>(as, "legal.get", { kind, locale });

describe("who may call what", () => {
  it("refuses a guest and a plain account, lets a translator and an admin read", async () => {
    expect((await failureOf(callAs(null, "legal.list"))).code).toBe(
      "UNAUTHORIZED"
    );
    expect((await failureOf(callAs(learner, "legal.list"))).code).toBe(
      "FORBIDDEN"
    );
    const lists = await Promise.all(
      [translator, admin].map((as) => callAs<LegalOverview>(as, "legal.list"))
    );
    for (const { items } of lists) {
      expect(items).toHaveLength(6);
    }
  });

  it("a translator drafts and publishes but cannot restore", async () => {
    await callAs(translator, "legal.save", {
      content: edited("Terms v2"),
      expectedUpdatedAt: null,
      kind: "terms",
      locale: "en",
    });
    const { draft } = await detail(translator, "terms", "en");
    await callAs(translator, "legal.publish", {
      effectiveDate: EFFECTIVE,
      expectedUpdatedAt: draft?.updatedAt,
      kind: "terms",
      locale: "en",
    });
    const refused = await failureOf(
      callAs(translator, "legal.restore", {
        effectiveDate: EFFECTIVE,
        kind: "terms",
        locale: "en",
        version: 1,
      })
    );
    expect(refused.code).toBe("FORBIDDEN");
  });
});

describe("the overview and the editor state", () => {
  it("lists the seeded version 1 of every text, effective 2026-09-30, no draft", async () => {
    const { items } = await callAs<LegalOverview>(translator, "legal.list");
    expect(items.map((item) => `${item.kind}:${item.locale}`).sort()).toEqual([
      "privacy:en",
      "privacy:fr",
      "privacy:nl",
      "terms:en",
      "terms:fr",
      "terms:nl",
    ]);
    for (const item of items) {
      expect(item.draft).toBeNull();
      expect(item.published).toMatchObject({
        effectiveDate: "2026-09-30",
        version: 1,
      });
    }
  });

  it("opens a text with its published version, the Dutch source and the history", async () => {
    const en = await detail(translator, "privacy", "en");
    expect(en.draft).toBeNull();
    expect(en.published?.version).toBe(1);
    expect(en.published?.content).toEqual(legalDocument("en", "privacy"));
    expect(en.canonical).toEqual(legalDocument("nl", "privacy"));
    expect(en.history.map((item) => item.version)).toEqual([1]);
    const nl = await detail(translator, "privacy", "nl");
    expect(nl.canonical).toBeNull();
  });

  it("a language that is not enabled is not found; a new language has no text yet", async () => {
    expect((await failureOf(detail(translator, "terms", "pt-BR"))).code).toBe(
      "NOT_FOUND"
    );
    await addLanguage(admin, "pt-BR", "Português", "pt-BR");
    const fresh = await detail(translator, "terms", "pt-BR");
    expect(fresh.published).toBeNull();
    expect(fresh.history).toEqual([]);
    expect(fresh.canonical).toEqual(legalDocument("nl", "terms"));
    const saved = await callAs<{ draft: { version: number } }>(
      translator,
      "legal.save",
      {
        content: legalDocument("nl", "terms"),
        expectedUpdatedAt: null,
        kind: "terms",
        locale: "pt-BR",
      }
    );
    expect(saved.draft.version).toBe(1);
  });
});

describe("saving a draft", () => {
  it("creates the draft, audits it, and the public text and the i18n version stay as they were", async () => {
    const mark = await auditMark();
    const before = await i18nVersion();
    const { draft } = await callAs<{
      draft: { updatedAt: number; version: number };
    }>(translator, "legal.save", {
      content: edited("Draft title"),
      expectedUpdatedAt: null,
      kind: "terms",
      locale: "en",
    });
    expect(draft.version).toBe(2);
    expect(await i18nVersion()).toBe(before);
    const [audit, ...rest] = await auditRowsSince(mark);
    expect(rest).toEqual([]);
    expect(audit).toMatchObject({
      action: "legal.draft_save",
      actorId: translator.user.id,
      data: { kind: "terms", locale: "en", version: 2 },
      targetId: "terms:en:2",
      targetType: "legal_text",
    });
    const published = await loadLegalText(
      { kv: env.KV, source: legalPublishedSource(testDb()) },
      "terms",
      "en"
    );
    expect(published?.version).toBe(1);
    const open = await detail(translator, "terms", "en");
    expect(open.draft?.updatedAt).toBe(draft.updatedAt);
  });

  it("saves again over the draft it opened, and saving the same text changes and audits nothing", async () => {
    const first = await callAs<{ draft: { updatedAt: number } }>(
      translator,
      "legal.save",
      {
        content: edited("One"),
        expectedUpdatedAt: null,
        kind: "terms",
        locale: "en",
      }
    );
    const second = await callAs<{
      draft: { updatedAt: number; version: number };
    }>(translator, "legal.save", {
      content: edited("Two"),
      expectedUpdatedAt: first.draft.updatedAt,
      kind: "terms",
      locale: "en",
    });
    expect(second.draft.updatedAt).toBeGreaterThan(first.draft.updatedAt);
    expect(second.draft.version).toBe(2);
    const mark = await auditMark();
    const again = await callAs<{ draft: { updatedAt: number } }>(
      translator,
      "legal.save",
      {
        content: edited("Two"),
        expectedUpdatedAt: second.draft.updatedAt,
        kind: "terms",
        locale: "en",
      }
    );
    expect(again.draft.updatedAt).toBe(second.draft.updatedAt);
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("a second editor with an old stamp gets CONFLICT with the stored draft", async () => {
    const first = await callAs<{ draft: { updatedAt: number } }>(
      translator,
      "legal.save",
      {
        content: edited("First"),
        expectedUpdatedAt: null,
        kind: "terms",
        locale: "en",
      }
    );
    const lost = await failureOf(
      callAs(admin, "legal.save", {
        content: edited("Second"),
        expectedUpdatedAt: null,
        kind: "terms",
        locale: "en",
      })
    );
    expect(lost.code).toBe("CONFLICT");
    expect(lost.data).toMatchObject({
      current: { updatedAt: first.draft.updatedAt, version: 2 },
      publishedVersion: 1,
    });
    const stale = await failureOf(
      callAs(admin, "legal.save", {
        content: edited("Third"),
        expectedUpdatedAt: first.draft.updatedAt - 5,
        kind: "terms",
        locale: "en",
      })
    );
    expect(stale.code).toBe("CONFLICT");
  });

  it("refuses an unsafe link, raw HTML and a privacy text without the consent control, naming the place", async () => {
    const bad = {
      sections: [
        {
          blocks: ["See [x](http://example.test) <b>now</b>"],
          id: "a",
          title: "A",
        },
      ],
      title: "T",
    };
    const refused = await failureOf(
      callAs(translator, "legal.save", {
        content: bad,
        expectedUpdatedAt: null,
        kind: "terms",
        locale: "en",
      })
    );
    expect(refused.code).toBe("VALIDATION");
    const { fieldErrors } = refused.data as {
      fieldErrors: Record<string, string[]>;
    };
    expect(fieldErrors.content).toEqual(
      expect.arrayContaining(["unsafeLink", "html"])
    );
    expect(fieldErrors["content@sections.0.blocks.0"]).toContain("unsafeLink");
    const noConsent = await failureOf(
      callAs(translator, "legal.save", {
        content: {
          ...bad,
          sections: [{ blocks: ["ok"], id: "a", title: "A" }],
        },
        expectedUpdatedAt: null,
        kind: "privacy",
        locale: "en",
      })
    );
    expect(
      (noConsent.data as { fieldErrors: Record<string, string[]> }).fieldErrors
        .content
    ).toContain("consentControl");
    expect((await detail(translator, "terms", "en")).draft).toBeNull();
  });
});

describe("publishing", () => {
  async function draftAs(as: Authed, title: string, kind = "terms") {
    const base =
      kind === "terms"
        ? edited(title)
        : { ...legalDocument("en", "privacy"), title };
    const { draft } = await callAs<{ draft: { updatedAt: number } }>(
      as,
      "legal.save",
      { content: base, expectedUpdatedAt: null, kind, locale: "en" }
    );
    return draft.updatedAt;
  }

  it("makes the draft version 2 with the effective date, audits it, bumps the i18n version and the page loader reads it", async () => {
    const updatedAt = await draftAs(translator, "Published title");
    const warm = await loadLegalText(
      { kv: env.KV, source: legalPublishedSource(testDb()) },
      "terms",
      "en"
    );
    expect(warm?.version).toBe(1);
    const before = await i18nVersion();
    const mark = await auditMark();
    const published = await callAs<LegalVersion>(translator, "legal.publish", {
      effectiveDate: EFFECTIVE,
      expectedUpdatedAt: updatedAt,
      kind: "terms",
      locale: "en",
    });
    expect(published).toMatchObject({
      effectiveDate: EFFECTIVE,
      publishedBy: "Test translator",
      version: 2,
    });
    expect(await i18nVersion()).not.toBe(before);
    const [audit, ...rest] = await auditRowsSince(mark);
    expect(rest).toEqual([]);
    expect(audit).toMatchObject({
      action: "legal.publish",
      actorId: translator.user.id,
      data: {
        effectiveDate: EFFECTIVE,
        kind: "terms",
        locale: "en",
        version: 2,
      },
      targetId: "terms:en:2",
    });
    // The loader keys its cache on the i18n version, so the new text shows at once.
    const live = await loadLegalText(
      { kv: env.KV, source: legalPublishedSource(testDb()) },
      "terms",
      "en"
    );
    expect(live).toMatchObject({ effectiveDate: EFFECTIVE, version: 2 });
    expect(live?.document.title).toBe("Published title");
    const open = await detail(translator, "terms", "en");
    expect(open.draft).toBeNull();
    expect(open.history.map((item) => item.version)).toEqual([2, 1]);
    expect(open.published?.version).toBe(2);
  });

  it("needs a draft, a valid date and the draft the editor saw", async () => {
    expect(
      (
        await failureOf(
          callAs(translator, "legal.publish", {
            effectiveDate: EFFECTIVE,
            expectedUpdatedAt: 1,
            kind: "terms",
            locale: "en",
          })
        )
      ).code
    ).toBe("NOT_FOUND");
    const updatedAt = await draftAs(translator, "x");
    expect(
      (
        await failureOf(
          callAs(translator, "legal.publish", {
            effectiveDate: "2026-02-30",
            expectedUpdatedAt: updatedAt,
            kind: "terms",
            locale: "en",
          })
        )
      ).code
      // Called without the HTTP layer, the schema's refusal is oRPC's BAD_REQUEST (the handler maps it to VALIDATION).
    ).toBe("BAD_REQUEST");
    const stale = await failureOf(
      callAs(translator, "legal.publish", {
        effectiveDate: EFFECTIVE,
        expectedUpdatedAt: updatedAt - 1,
        kind: "terms",
        locale: "en",
      })
    );
    expect(stale.code).toBe("CONFLICT");
    expect((await detail(translator, "terms", "en")).draft).not.toBeNull();
  });

  it("publishing a privacy text keeps the consent control and the other languages untouched", async () => {
    const updatedAt = await draftAs(translator, "New privacy", "privacy");
    await callAs(translator, "legal.publish", {
      effectiveDate: EFFECTIVE,
      expectedUpdatedAt: updatedAt,
      kind: "privacy",
      locale: "en",
    });
    expect((await detail(translator, "privacy", "fr")).published?.version).toBe(
      1
    );
    expect((await detail(translator, "privacy", "en")).published?.version).toBe(
      2
    );
  });
});

describe("restoring", () => {
  it("lets an admin copy an earlier version into a new published one, audited, history kept", async () => {
    const { draft } = await callAs<{ draft: { updatedAt: number } }>(
      translator,
      "legal.save",
      {
        content: edited("Second text"),
        expectedUpdatedAt: null,
        kind: "terms",
        locale: "en",
      }
    );
    await callAs(translator, "legal.publish", {
      effectiveDate: EFFECTIVE,
      expectedUpdatedAt: draft.updatedAt,
      kind: "terms",
      locale: "en",
    });
    const before = await i18nVersion();
    const mark = await auditMark();
    const restored = await callAs<LegalVersion>(admin, "legal.restore", {
      effectiveDate: "2026-12-01",
      kind: "terms",
      locale: "en",
      version: 1,
    });
    expect(restored).toMatchObject({
      effectiveDate: "2026-12-01",
      publishedBy: "Test admin",
      version: 3,
    });
    expect(await i18nVersion()).not.toBe(before);
    const [audit] = await auditRowsSince(mark);
    expect(audit).toMatchObject({
      action: "legal.restore",
      actorId: admin.user.id,
      data: { kind: "terms", locale: "en", restoredFrom: 1, version: 3 },
      targetId: "terms:en:3",
    });
    const open = await detail(admin, "terms", "en");
    expect(open.history.map((item) => item.version)).toEqual([3, 2, 1]);
    expect(open.published?.content).toEqual(legalDocument("en", "terms"));
    const old = await callAs<{ content: LegalDocument }>(
      translator,
      "legal.version",
      { kind: "terms", locale: "en", version: 2 }
    );
    expect(old.content.title).toBe("Second text");
  });

  it("refuses a version that was never published", async () => {
    expect(
      (
        await failureOf(
          callAs(admin, "legal.restore", {
            effectiveDate: EFFECTIVE,
            kind: "terms",
            locale: "en",
            version: 9,
          })
        )
      ).code
    ).toBe("NOT_FOUND");
    expect(
      (
        await failureOf(
          callAs(translator, "legal.version", {
            kind: "terms",
            locale: "en",
            version: 9,
          })
        )
      ).code
    ).toBe("NOT_FOUND");
  });

  it("a restore while a draft is open leaves the draft, which still publishes after it", async () => {
    const { draft } = await callAs<{ draft: { updatedAt: number } }>(
      translator,
      "legal.save",
      {
        content: edited("Pending"),
        expectedUpdatedAt: null,
        kind: "terms",
        locale: "en",
      }
    );
    const restored = await callAs<LegalVersion>(admin, "legal.restore", {
      effectiveDate: EFFECTIVE,
      kind: "terms",
      locale: "en",
      version: 1,
    });
    expect(restored.version).toBe(3);
    const published = await callAs<LegalVersion>(translator, "legal.publish", {
      effectiveDate: EFFECTIVE,
      expectedUpdatedAt: draft.updatedAt,
      kind: "terms",
      locale: "en",
    });
    expect(published.version).toBe(4);
    const live = await detail(translator, "terms", "en");
    expect(live.published?.version).toBe(4);
    expect(JSON.stringify(live.published?.content)).toContain("Pending");
  });
});
