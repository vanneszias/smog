import { useTranslation } from "@smog/i18n/react";
import type { ReactElement } from "react";
import { TabPlaceholder } from "@/screens/tab-placeholder";

export default function SearchScreen(): ReactElement {
  const { t } = useTranslation();
  return <TabPlaceholder illustration={1} title={t("nav.search")} />;
}
