import { uiCatalogueSource } from "@smog/db";
import {
  type EmailTemplateId,
  type RenderedEmail,
  renderEmail,
} from "@smog/email";
import { EMAIL_SAMPLES, EMAIL_TEMPLATE_IDS } from "@smog/email/samples";
import { resolveLocale } from "@smog/i18n";
import { type LoadedCatalogue, loadCatalogue } from "@smog/i18n/server";
import type { RpcContext } from "@smog/rpc";
import type { EmailTemplateSummary } from "../schema";
import { type AdminDeps, adminProcedure } from "./procedure";

type Context = Pick<RpcContext, "db" | "env" | "kv">;

/**
 * The enabled languages and the `ui_string` overlay of `locale` (the same
 * merged catalogue a sent email reads, so a translator sees an edit here
 * before it goes out). `locale` is the language when it is enabled, else
 * the default one: the caller compares `catalogue.locale`.
 */
function catalogueFor(
  context: Context,
  locale: string
): Promise<LoadedCatalogue> {
  return loadCatalogue(
    { kv: context.kv, source: uiCatalogueSource(context.db) },
    (enabled, fallback) =>
      resolveLocale({ preference: locale }, enabled, fallback)
  );
}

/**
 * `template` rendered from its sample: never sent, nothing stored. The
 * header logo comes from this site (`SITE_URL`), as in a sent email.
 */
function renderSample(
  template: EmailTemplateId,
  catalogue: LoadedCatalogue,
  siteUrl: string
): Promise<RenderedEmail> {
  // Each id's sample has that template's props (`EMAIL_SAMPLES`' mapped type).
  return renderEmail(
    template,
    EMAIL_SAMPLES[template] as never,
    catalogue.locale,
    { overlay: catalogue.overlay, siteUrl }
  );
}

/** Every template's sample subject in each enabled language. */
async function summaries(context: Context): Promise<EmailTemplateSummary[]> {
  const first = await catalogueFor(context, "");
  const catalogues = await Promise.all(
    first.languages.map((language) => catalogueFor(context, language.code))
  );
  return await Promise.all(
    EMAIL_TEMPLATE_IDS.map(async (id) => {
      const subjects = await Promise.all(
        catalogues.map(
          async (catalogue) =>
            [
              catalogue.locale,
              (await renderSample(id, catalogue, context.env.SITE_URL)).subject,
            ] as const
        )
      );
      return { id, subject: Object.fromEntries(subjects) };
    })
  );
}

/** The `emails` slice of the admin router (A-25, W-07): reads only. */
export function emailsRoutes(_deps: AdminDeps) {
  return {
    emails: {
      list: adminProcedure.emails.list.handler(({ context }) =>
        summaries(context)
      ),
      preview: adminProcedure.emails.preview.handler(
        async ({ context, errors, input }) => {
          const catalogue = await catalogueFor(context, input.locale);
          if (catalogue.locale !== input.locale) {
            throw errors.VALIDATION({
              data: {
                fieldErrors: { locale: ["unknown"] },
                formErrors: [],
              },
            });
          }
          return renderSample(input.template, catalogue, context.env.SITE_URL);
        }
      ),
    },
  };
}
