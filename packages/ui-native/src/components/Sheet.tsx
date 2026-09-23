import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { Modal, View } from "react-native";
import { cn } from "../lib/cn";
import { Button } from "./Button";
import { Text } from "./Text";

/**
 * The native twin of `packages/ui-web/src/components/Sheet.tsx`, and — on
 * this platform — also of `Dialog`, `DropdownMenu` and `Select`: on a phone,
 * a filter panel, a confirmation and a list of choices are all the same
 * gesture, a surface that rises to cover the screen and gives one way back.
 * `packages/ui-web` needs four components for that; this package needs one.
 *
 * Built on React Native's own `Modal` rather than `@gorhom/bottom-sheet`. Both
 * are testable here — `jest.setup.ts`'s worklets-then-reanimated mock order
 * makes the gesture-driven library render under Jest too, so that was not the
 * deciding factor. What decided it: the two consumers this component actually
 * has, a category filter and a list picker, need a surface that opens, is
 * labelled, and closes — not a drag handle. `Modal` gives that with zero new
 * dependencies, where `@gorhom/bottom-sheet` would add its own weight (it pulls
 * in `react-native-gesture-handler` on top of reanimated) for a swipe gesture
 * neither consumer asks for. The gesture-driven version stays a want, to be
 * weighed against the app's bundle size rather than assumed here.
 *
 * No internal open state: `open` is read straight from the caller, same
 * contract as a controlled `Dialog` on web. Rendering `null` while closed,
 * rather than trusting `Modal`'s own `visible={false}`, is not what makes
 * "renders nothing while closed" pass under Jest — `react-native`'s own jest
 * preset replaces `Modal` with a mock (`react-native/jest/mocks/Modal.js`)
 * whose `render()` already returns `null` when `visible === false`, so that
 * assertion is carried by the test environment either way. What this guard
 * earns instead is real: it keeps a closed `Sheet` from mounting a `Modal`
 * instance at all — no native listeners registered, no chance of tripping
 * `Modal`'s iOS-only `isRendered` latch — which the mock cannot stand in for
 * and nothing here tests. See `Sheet.test.tsx` for where the closed/open
 * pair's real coverage actually sits.
 */
export const sheetVariants = cva("flex-1 bg-surface-raised");

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  testID?: string;
}

export function Sheet({
  children,
  className,
  onClose,
  open,
  testID = "root",
  title,
}: SheetProps) {
  if (!open) {
    return null;
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={open}
    >
      <View
        accessibilityLabel={title}
        accessibilityViewIsModal
        className={cn(sheetVariants(), className)}
        testID={testID}
      >
        <View className="flex-row items-center justify-between border-border-subtle border-b p-md">
          <Text accessibilityRole="header" variant="heading">
            {title}
          </Text>
          <Button onPress={onClose} size="sm" variant="ghost">
            Close
          </Button>
        </View>
        <View className="flex-1 p-md">{children}</View>
      </View>
    </Modal>
  );
}
