import { Tabs } from "expo-router";

/**
 * The two tabs almost everybody who installs this app ever uses: the
 * gesture list and search. `headerShown: false` here for the same reason the
 * root `Stack` in `app/_layout.tsx` sets it — each screen renders its own
 * heading rather than a native navigation bar duplicating it.
 */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Gebaren" }} />
      <Tabs.Screen name="search" options={{ title: "Zoeken" }} />
      <Tabs.Screen name="favorites" options={{ title: "Favorieten" }} />
      <Tabs.Screen name="lists" options={{ title: "Lijsten" }} />
      <Tabs.Screen name="settings" options={{ title: "Instellingen" }} />
    </Tabs>
  );
}
