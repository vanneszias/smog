import type { ReactElement } from "react";
import { Text, View } from "react-native";

export default function HomeScreen(): ReactElement {
  return (
    <View className="flex-1 items-center justify-center bg-background dark:bg-background-dark">
      <Text className="font-semibold text-primary text-title-1 dark:text-primary-dark">
        SMOG & Co
      </Text>
    </View>
  );
}
