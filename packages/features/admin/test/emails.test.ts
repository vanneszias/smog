import { LOCALES } from "@smog/config/constants";
import { renderEmail } from "@smog/email";
import { EMAIL_SAMPLES, EMAIL_TEMPLATE_IDS } from "@smog/email/samples";
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
          locale
        );
        expect(preview).toEqual(expected);
        expect(preview.html).toContain(`lang="${locale}"`);
      });
    }
  }

  // In process an input error is `BAD_REQUEST`; the rpc handler answers it
  // as `VALIDATION` (`@smog/rpc` validation interceptor).
  it("refuses an unknown template or locale, and audits nothing", async () => {
    const mark = await auditMark();
    await expect(
      callAs(admin, "emails.preview", { locale: "nl", template: "auth/nope" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      callAs(admin, "emails.preview", { locale: "de", template: "auth/otp" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await auditRowsSince(mark)).toEqual([]);
  });
});
