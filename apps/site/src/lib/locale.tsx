import type { Locale } from "@smog/i18n";
import { createContext, type ReactNode, useContext } from "react";

interface LocaleValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleValue | null>(null);

export function LocaleProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: LocaleValue;
}): ReactNode {
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("[locale] useLocale must be used inside LocaleProvider");
  }
  return value;
}
