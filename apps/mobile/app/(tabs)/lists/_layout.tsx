import { Stack } from "expo-router";

/**
 * The lists tab's own stack: an index of the account's lists, and one list's
 * detail. `headerShown: false` for the same reason every other stack in this
 * app sets it — each screen renders its own heading.
 */
export default function ListsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
