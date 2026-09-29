import { useTranslation } from "@smog/i18n/react";
import { useColor } from "@smog/ui-native";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import type { ReactElement } from "react";

/** The native tab bar: Home · Search · Favorites · Lists (spec §10). */
export default function TabsLayout(): ReactElement {
  const { t } = useTranslation();
  const primary = useColor("primary");
  const muted = useColor("foregroundMuted");
  return (
    <NativeTabs iconColor={muted} tintColor={primary}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t("nav.home")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md="home"
          sf={{ default: "house", selected: "house.fill" }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search" role="search">
        <NativeTabs.Trigger.Label>{t("nav.search")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="search" sf="magnifyingglass" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="favorites">
        <NativeTabs.Trigger.Label>
          {t("nav.favorites")}
        </NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md="favorite"
          sf={{ default: "heart", selected: "heart.fill" }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="lists">
        <NativeTabs.Trigger.Label>{t("nav.lists")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="list" sf="list.bullet" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
