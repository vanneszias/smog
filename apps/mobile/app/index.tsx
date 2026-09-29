import type { ReactElement } from "react";
import { Text, View } from "react-native";

export default function HomeScreen(): ReactElement {
  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-black">
      <Text className="font-bold text-3xl text-brand">SMOG & Co</Text>
    </View>
  );
}
