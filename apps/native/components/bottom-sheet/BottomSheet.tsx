import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import type { ViewStyle } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useNativeInteractions } from "@/hooks/useNativeInteractions";

interface BottomSheetProps {
  /**
   * Determines whether the bottom sheet is visible.
   */
  visible: boolean;
  /**
   * Function to call when the bottom sheet is dismissed.
   */
  onClose: () => void;
  /**
   * The content to be rendered inside the bottom sheet.
   */
  children: React.ReactNode;
  /**
   * An array of snap points for the sheet.
   * e.g., ['50%', '90%']
   */
  snapPoints?: (string | number)[];
  /**
   * Optional style for the content container.
   */
  contentContainerStyle?: ViewStyle;
}

/**
 * A reusable BottomSheet component that replaces the default Modal.
 * It uses @gorhom/bottom-sheet for a native feel and gesture support.
 */
const BottomSheet: React.FC<BottomSheetProps> = ({
  visible,
  onClose,
  children,
  snapPoints = ["50%"],
  contentContainerStyle,
}) => {
  const { theme } = useTheme();
  const { triggerHaptic } = useNativeInteractions();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    if (visible) {
      bottomSheetModalRef.current?.present();
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleChildTouch = () => {
    triggerHaptic("light");
    return false;
  };

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.background }}
      enablePanDownToClose
      index={0}
      onDismiss={handleDismiss}
      ref={bottomSheetModalRef}
      snapPoints={snapPoints}
    >
      <BottomSheetView
        onTouchStart={handleChildTouch}
        style={contentContainerStyle}
      >
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
};

export default BottomSheet;
