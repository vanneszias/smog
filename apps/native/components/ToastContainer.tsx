import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import type React from "react";
import Toast from "@/components/Toast";
import { useToast } from "@/context/ToastContext";

/**
 * Reads the native tab bar height so the toast clears it correctly.
 * Falls back to 0 on screens without a tab navigator (modals, settings, etc.).
 */
function useTabBarOffset(): number {
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: intentional guard — throws outside tab navigator
    return useBottomTabBarHeight();
  } catch {
    return 0;
  }
}

export const ToastContainer: React.FC = () => {
  const { isVisible, toastOptions, hideToast } = useToast();
  const tabBarOffset = useTabBarOffset();

  if (!toastOptions) {
    return null;
  }

  return (
    <Toast
      action={toastOptions.action}
      extraBottomOffset={tabBarOffset}
      message={toastOptions.message}
      onHide={hideToast}
      type={toastOptions.type}
      visible={isVisible}
    />
  );
};

export default ToastContainer;
