import { LOCALES, type Locale } from "@smog/config/constants";
import {
  type EmailTemplateId,
  type RenderedEmail,
  renderEmail,
} from "@smog/email";
import { EMAIL_SAMPLES, EMAIL_TEMPLATE_IDS } from "@smog/email/samples";
import type { EmailTemplateSummary } from "../schema";
import { type AdminDeps, adminProcedure } from "./procedure";

/**
 * `template` rendered from its sample: never sent, nothing stored. The
 * header logo comes from this site (`SITE_URL`), as in a sent email.
 */
function renderSample(
  template: EmailTemplateId,
  locale: Locale,
  siteUrl: string
): Promise<RenderedEmail> {
  // Each id's sample has that template's props (`EMAIL_SAMPLES`' mapped type).
  return renderEmail(template, EMAIL_SAMPLES[template] as never, locale, {
    siteUrl,
  });
}

async function summary(
  id: EmailTemplateId,
  siteUrl: string
): Promise<EmailTemplateSummary> {
  const subjects = await Promise.all(
    LOCALES.map(
      async (locale) =>
        [locale, (await renderSample(id, locale, siteUrl)).subject] as const
    )
  );
  return {
    id,
    subject: Object.fromEntries(subjects) as Record<Locale, string>,
  };
}

/** The `emails` slice of the admin router (A-25, W-07): reads only. */
export function emailsRoutes(_deps: AdminDeps) {
  return {
    emails: {
      list: adminProcedure.emails.list.handler(({ context }) =>
        Promise.all(
          EMAIL_TEMPLATE_IDS.map((id) => summary(id, context.env.SITE_URL))
        )
      ),
      preview: adminProcedure.emails.preview.handler(({ context, input }) =>
        renderSample(input.template, input.locale, context.env.SITE_URL)
      ),
    },
  };
}
