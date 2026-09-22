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
 * Built on React Native's own `Modal` rather than `@gorhom/bottom-sheet`.
 * `apps/native` already depends on `@gorhom/bottom-sheet`, and both it and
 * `Modal` are testable here — `jest.setup.ts`'s worklets-then-reanimated
 * mock order makes the gesture-driven library render under Jest too, so
 * that was not the deciding factor. What decided it: the two consumers this
 * component actually has, a category filter (Task 10) and a list picker
 * (Task 11), need a surface that opens, is labelled, and closes — not a
 * drag handle. `Modal` gives that with zero new dependencies, where
 * `@gorhom/bottom-sheet` would add its own weight (it pulls in
 * `react-native-gesture-handler` on top of reanimated) for a swipe gesture
 * neither consumer asks for. The gesture-driven version stays a want,
 * documented for Task 7's bundle measurement rather than assumed here.
 *
 * No internal open state: `open` is read straight from the caller, same
 * contract as a controlled `Dialog` on web. Rendering `null` while closed
 * (rather than trusting `Modal`'s own `visible={false}`) matters for a
 * concrete reason, not just belt-and-braces — it is what makes "renders
 * nothing while closed" a real assertion about this component's own
 * behaviour, distinct from "renders its contents while open", instead of a
 * pair where the first would pass on a `Sheet` that never renders anything
 * at all.
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
