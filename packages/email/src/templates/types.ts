import type { Locale, Translate } from "@smog/i18n";
import type { ReactNode } from "react";

/** A `t` bound to one locale (from `createI18n`): `@smog/i18n`'s `Translate`. */
export type { Translate } from "@smog/i18n";

export interface TemplateContext {
  locale: Locale;
  /** The site origin (`SITE_URL`) the header logo is loaded from; the wordmark without it. */
  siteUrl?: string | undefined;
  t: Translate;
}

/** A template: its subject line and its React Email body. */
export interface EmailTemplate<Props> {
  render: (props: Props, context: TemplateContext) => ReactNode;
  subject: (props: Props, context: TemplateContext) => string;
}
