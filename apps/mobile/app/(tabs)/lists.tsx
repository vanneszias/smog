import { useTranslation } from "@smog/i18n/react";
import type { ReactElement } from "react";
import { TabPlaceholder } from "@/screens/tab-placeholder";

export default function ListsScreen(): ReactElement {
  const { t } = useTranslation();
  return <TabPlaceholder title={t("nav.lists")} />;
}
