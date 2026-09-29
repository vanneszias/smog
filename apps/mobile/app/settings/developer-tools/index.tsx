import { useTranslation } from "@smog/i18n/react";
import { ListItem, useColor } from "@smog/ui-native";
import { useRouter } from "expo-router";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import LayoutGrid from "lucide-react-native/icons/layout-grid";
import { type ReactElement, useCallback } from "react";
import { ScrollView } from "react-native";

/** Developer tools (dev and staging builds): the entries; logs and mail join later. */
export default function DeveloperToolsScreen(): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const muted = useColor("foregroundMuted");
  const openGallery = useCallback((): void => {
    router.push("/settings/developer-tools/gallery");
  }, [router]);
  return (
    <ScrollView contentContainerClassName="py-2">
      <ListItem
        leading={<LayoutGrid color={muted} />}
        onPress={openGallery}
        title={t("devTools.componentGallery")}
        trailing={<ChevronRight color={muted} />}
      />
    </ScrollView>
  );
}
