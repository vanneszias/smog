import { useTranslation } from "@smog/i18n/react";
import { Button, Text } from "@smog/ui-native";
import { useRouter } from "expo-router";
import Settings from "lucide-react-native/icons/settings";
import { type ReactElement, useCallback } from "react";
import { TabPlaceholder } from "@/screens/tab-placeholder";

/** Home: the hero, search and categories arrive in phase 3. */
export default function HomeScreen(): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const openSettings = useCallback(() => router.push("/settings"), [router]);
  return (
    <TabPlaceholder title={t("common.appName")}>
      <Text className="text-center" tone="muted">
        {t("home.tagline")}
      </Text>
      <Button icon={<Settings />} onPress={openSettings} variant="secondary">
        {t("nav.settings")}
      </Button>
    </TabPlaceholder>
  );
}
