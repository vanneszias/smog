import { jest } from "@jest/globals";

// Runs before the test framework: native modules that do not exist under
// the test renderer are swapped for their published jest mocks.
type Module = Record<string, unknown>;

jest.mock("react-native-worklets", () =>
  jest.requireActual<Module>("react-native-worklets/lib/module/mock")
);
// The published mock leaves out `useReducedMotion`; tests switch it on to
// check that the kit drops its animations.
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Module>("react-native-reanimated/mock"),
  useReducedMotion: jest.fn(() => false),
}));
jest.requireActual("react-native-gesture-handler/jestSetup");
jest.mock(
  "react-native-safe-area-context",
  () =>
    jest.requireActual<{ default: Module }>(
      "react-native-safe-area-context/jest/mock"
    ).default
);

interface SheetModalMock {
  // biome-ignore lint/style/useConsistentMethodSignatures: a class method, so the subclass can call `super.dismiss()`
  dismiss(): void;
  props: { onDismiss?: () => void };
}

// The published mock never calls `onDismiss`; the kit's sheets unmount
// their content there, so the mock's `dismiss()` reports it like the real one.
jest.mock("@gorhom/bottom-sheet", () => {
  const mock = jest.requireActual<
    Module & { BottomSheetModal: new () => SheetModalMock }
  >("@gorhom/bottom-sheet/mock");
  class BottomSheetModal extends mock.BottomSheetModal {
    override dismiss(): void {
      super.dismiss();
      this.props.onDismiss?.();
    }
  }
  return { ...mock, BottomSheetModal };
});

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Heavy: "heavy", Light: "light", Medium: "medium" },
  impactAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: {
    Error: "error",
    Success: "success",
    Warning: "warning",
  },
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
}));
