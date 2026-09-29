import { createI18n, type Locale } from "@smog/i18n";
import { I18nextProvider } from "@smog/i18n/react";
import { type RenderResult, render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

/** Renders `ui` inside an i18n provider (English by default, so labels read naturally in assertions). */
export function renderKit(
  ui: ReactElement,
  locale: Locale = "en"
): RenderResult {
  const i18n = createI18n(locale);
  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
  }
  return render(ui, { wrapper: Wrapper });
}

const WHITESPACE = /\s+/;

/** The class tokens of an element (never substring-match the joined string). */
export function classesOf(element: Element | null): string[] {
  return (element?.getAttribute("class") ?? "")
    .split(WHITESPACE)
    .filter(Boolean);
}
