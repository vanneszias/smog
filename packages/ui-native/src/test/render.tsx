import { createI18n } from "@smog/i18n";
import { I18nextProvider } from "@smog/i18n/react";
import { type RenderResult, render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { KitProvider } from "../components/kit-provider";
import { ToastProvider } from "../components/toast";

/** The English catalogue, so tests read the same labels a user hears. */
const i18n = createI18n("en");
export const t = i18n.t.bind(i18n);

/** Renders `ui` inside the providers an app root sets up. */
export function renderKit(ui: ReactElement): Promise<RenderResult> {
  return render(
    <I18nextProvider i18n={i18n}>
      <KitProvider>
        <ToastProvider>{ui}</ToastProvider>
      </KitProvider>
    </I18nextProvider>
  );
}
