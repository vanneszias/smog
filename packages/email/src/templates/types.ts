import type { createI18n, Locale } from "@smog/i18n";
import type { ReactNode } from "react";

/** A `t` bound to one locale (from `createI18n`). */
export type Translate = ReturnType<typeof createI18n>["t"];

interface TemplateContext {
  locale: Locale;
  t: Translate;
}

/** A template: its subject line and its React Email body. */
export interface EmailTemplate<Props> {
  render: (props: Props, context: TemplateContext) => ReactNode;
  subject: (props: Props, context: TemplateContext) => string;
}
