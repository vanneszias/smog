import { Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * A stand-in screen that shows the safe-area insets it is handed, for
 * `src/screens/rootLayout.test.tsx` to mount in place of the root `Stack`.
 * In its own file for the reason `src/test/expoVideoMock.tsx` gives:
 * `nativewind/babel` rewrites `Text` through a helper that a `jest.mock()`
 * factory's sandbox cannot see.
 */
export function InsetsProbe() {
  const insets = useSafeAreaInsets();

  return (
    <Text testID="probe">{`top=${insets.top} bottom=${insets.bottom}`}</Text>
  );
}
