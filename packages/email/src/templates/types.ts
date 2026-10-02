import type { Locale, Translate } from "@smog/i18n";
import type { ReactNode } from "react";

/** A `t` bound to one locale (from `createI18n`): `@smog/i18n`'s `Translate`. */
export type { Translate } from "@smog/i18n";

interface TemplateContext {
  locale: Locale;
  t: Translate;
}

/** A template: its subject line and its React Email body. */
export interface EmailTemplate<Props> {
  render: (props: Props, context: TemplateContext) => ReactNode;
  subject: (props: Props, context: TemplateContext) => string;
}
