import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { tokens } from "@smog/styles/tokens";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { View } from "react-native";
import { ReduceMotion, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "../lib/cn";
import { useColor, useShadow, useThemeVars } from "../lib/theme";

function Backdrop(props: BottomSheetBackdropProps): ReactElement {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      pressBehavior="close"
    />
  );
}

/** The drag handle, decorative (gorhom's default one has an English label). */
function Handle(): ReactElement {
  const color = useColor("border");
  return (
    <View
      accessibilityElementsHidden
      className="items-center pt-2 pb-1"
      importantForAccessibility="no-hide-descendants"
    >
      <View
        className="h-1 w-10 rounded-full"
        style={{ backgroundColor: color }}
      />
    </View>
  );
}

export interface SheetPanelProps {
  children: ReactNode;
  className?: string;
  /** Called when the sheet was dismissed by a swipe, the backdrop or back. */
  onClose: () => void;
  open: boolean;
  testID?: string;
}

/**
 * The bottom sheet behind Sheet, Select and Menu: a `@gorhom/bottom-sheet`
 * modal sized to its content, with the theme variables re-applied at its
 * root (it mounts in the provider's portal host), VoiceOver kept inside
 * (`accessibilityViewIsModal`) and no animation under reduced motion.
 */
export function SheetPanel({
  children,
  className,
  onClose,
  open,
  testID,
}: SheetPanelProps): ReactElement {
  const ref = useRef<BottomSheetModal>(null);
  const [mounted, setMounted] = useState(open);
  const reducedMotion = useReducedMotion();
  const themeVars = useThemeVars();
  const background = useColor("surfaceRaised");
  const shadow = useShadow("2");
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (open) {
      setMounted(true);
      ref.current?.present();
    } else {
      ref.current?.dismiss();
    }
  }, [open]);

  const handleDismiss = useCallback((): void => {
    setMounted(false);
    if (open) {
      onClose();
    }
  }, [onClose, open]);

  return (
    <BottomSheetModal
      accessible={false}
      backdropComponent={Backdrop}
      backgroundStyle={{ backgroundColor: background }}
      enableDynamicSizing
      handleComponent={Handle}
      onDismiss={handleDismiss}
      overrideReduceMotion={
        reducedMotion ? ReduceMotion.Always : ReduceMotion.System
      }
      ref={ref}
      style={shadow}
    >
      {/* Rendered from the render that opens it (so the sheet can size to
          it on present) until the close animation has finished. */}
      {open || mounted ? (
        <BottomSheetScrollView>
          <View
            accessibilityViewIsModal
            className={cn("flex-col gap-4 px-6 pt-2", className)}
            style={[
              themeVars,
              { paddingBottom: insets.bottom + tokens.spacing["6"] },
            ]}
            testID="overlay-theme-root"
          >
            <View className="flex-col gap-4" testID={testID}>
              {children}
            </View>
          </View>
        </BottomSheetScrollView>
      ) : null}
    </BottomSheetModal>
  );
}
