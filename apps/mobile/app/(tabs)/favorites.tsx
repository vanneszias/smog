import { useTranslation } from "@smog/i18n/react";
import type { ReactElement } from "react";
import { TabPlaceholder } from "@/screens/tab-placeholder";

export default function FavoritesScreen(): ReactElement {
  const { t } = useTranslation();
  return <TabPlaceholder illustration={2} title={t("nav.favorites")} />;
}
