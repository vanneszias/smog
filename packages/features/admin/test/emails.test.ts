import { env } from "cloudflare:workers";
import { LOCALES } from "@smog/config/constants";
import { renderEmail } from "@smog/email";
import { EMAIL_SAMPLES, EMAIL_TEMPLATE_IDS } from "@smog/email/samples";
import { bumpI18nVersion, resetCatalogueCache } from "@smog/i18n/server";
import { beforeAll, describe, expect, it } from "vitest";
import type { EmailPreview, EmailTemplateSummary } from "../src/schema";
import {
  type Authed,
  auditMark,
  auditRowsSince,
  callAs,
  signedUp,
} from "./helpers";

/*
 * `admin.emails.*` (A-25, W-07): the real templates rendered with
 * `EMAIL_SAMPLES` in every locale. Reads: nothing is sent or stored.
 */

let admin: Authed;

beforeAll(async () => {
  admin = await signedUp("admin");
});

describe("admin.emails.list", () => {
  it("lists every registered template with its subject in each locale", async () => {
    const list = await callAs<EmailTemplateSummary[]>(admin, "emails.list");
    expect(list.map((item) => item.id)).toEqual([...EMAIL_TEMPLATE_IDS]);
    const otp = list.find((item) => item.id === "auth/otp");
    expect(otp?.subject).toEqual({
      en: "482913 is your SMOG & Co code",
      fr: expect.stringContaining("482913"),
      nl: "482913 is je code voor SMOG & Co",
    });
    for (const item of list) {
      expect(Object.keys(item.subject).sort()).toEqual([...LOCALES].sort());
    }
  });
});

describe("admin.emails.preview", () => {
  for (const template of EMAIL_TEMPLATE_IDS) {
    for (const locale of LOCALES) {
      it(`renders ${template} in ${locale} from its sample`, async () => {
        const preview = await callAs<EmailPreview>(admin, "emails.preview", {
          locale,
          template,
        });
        const expected = await renderEmail(
          template,
          EMAIL_SAMPLES[template] as never,
          locale,
          { siteUrl: "http://localhost:5173" }
        );
        expect(preview).toEqual(expected);
        expect(preview.html).toContain(`lang="${locale}"`);
      });
    }
  }

  // In process an input error is `BAD_REQUEST`; the rpc handler answers it
  // as `VALIDATION` (`@smog/rpc` validation interceptor).
  it("refuses an unknown template, a malformed locale and a language that is not enabled, and audits nothing", async () => {
    const mark = await auditMark();
    await expect(
      callAs(admin, "emails.preview", { locale: "nl", template: "auth/nope" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      callAs(admin, "emails.preview", { locale: "!!", template: "auth/otp" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Well formed, but no such enabled language: the handler refuses.
    await expect(
      callAs(admin, "emails.preview", { locale: "de", template: "auth/otp" })
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("shows a translator's edit and a language added as data", async () => {
    resetCatalogueCache();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO ui_string (locale, key, value, updated_at) VALUES ('en', 'email.auth.otp.subject', 'Edited {{code}} subject', 1)"
      ),
      env.DB.prepare(
        "INSERT INTO language (code, name, intl_tag, enabled, is_default, sort_order) VALUES ('de', 'Deutsch', 'de-BE', 1, 0, 9)"
      ),
    ]);
    // A new version, as every translation write does.
    await bumpI18nVersion(env.KV);
    try {
      const preview = await callAs<EmailPreview>(admin, "emails.preview", {
        locale: "en",
        template: "auth/otp",
      });
      expect(preview.subject).toBe("Edited 482913 subject");
      // A language without texts shows the Dutch text, never an empty subject.
      const german = await callAs<EmailPreview>(admin, "emails.preview", {
        locale: "de",
        template: "auth/otp",
      });
      expect(german.subject).toBe("482913 is je code voor SMOG & Co");
      const list = await callAs<EmailTemplateSummary[]>(admin, "emails.list");
      const otp = list.find((item) => item.id === "auth/otp");
      expect(Object.keys(otp?.subject ?? {}).sort()).toEqual([
        "de",
        "en",
        "fr",
        "nl",
      ]);
      expect(otp?.subject.en).toBe("Edited 482913 subject");
    } finally {
      await env.DB.batch([
        env.DB.prepare(
          "DELETE FROM ui_string WHERE key = 'email.auth.otp.subject'"
        ),
        env.DB.prepare("DELETE FROM language WHERE code = 'de'"),
      ]);
      await bumpI18nVersion(env.KV);
      resetCatalogueCache();
    }
  });
});
