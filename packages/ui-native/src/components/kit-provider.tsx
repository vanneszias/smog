import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import type { ReactElement, ReactNode } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

/**
 * The native roots the kit's overlays need: the gesture handler root and
 * the bottom sheet host (Sheet, Select, Menu). Put it inside the app's
 * ThemeRoot, around the navigator. Native only; web has no equivalent.
 */
export function KitProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <GestureHandlerRootView style={styles.root}>
      <BottomSheetModalProvider>{children}</BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

// A third-party view: NativeWind does not map its className.
const styles = StyleSheet.create({ root: { flex: 1 } });
