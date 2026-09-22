import { Stack } from "expo-router";

/**
 * The settings tab's own stack: the settings index (language, theme,
 * sign-out, the sponsor link) and the account screen (password, email,
 * delete). `headerShown: false` for the same reason every other stack in
 * this app sets it — each screen renders its own heading.
 */
export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="account" />
    </Stack>
  );
}
