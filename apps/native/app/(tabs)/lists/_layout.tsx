import { Stack } from "expo-router";

// Keep the lists overview underneath deep-linked list detail screens.
export const unstable_settings = {
  initialRouteName: "index",
};

export default function ListsLayout() {
  return <Stack />;
}
