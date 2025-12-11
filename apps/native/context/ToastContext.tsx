import type React from "react";
import { createContext, useContext, useRef, useState } from "react";
import type { ToastAction } from "@/components/Toast";

export type ToastOptions = {
  message: string;
  action?: ToastAction;
  duration?: number;
  type?: "info" | "success" | "warning" | "error";
};

type ToastContextType = {
  showToast: (options: ToastOptions) => void;
  hideToast: () => void;
  triggerHide: () => void;
  registerHideCallback: (callback: () => void) => void;
  isVisible: boolean;
  toastOptions: ToastOptions | null;
};

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
  hideToast: () => {},
  triggerHide: () => {},
  registerHideCallback: () => {},
  isVisible: false,
  toastOptions: null,
});

export const useToast = () => useContext(ToastContext);

type ToastProviderProps = {
  children: React.ReactNode;
};

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [toastOptions, setToastOptions] = useState<ToastOptions | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const triggerHideCallbackRef = useRef<(() => void) | null>(null);

  const showToast = (options: ToastOptions) => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setToastOptions(options);
    setIsVisible(true);

    // Auto-hide after duration if specified
    const duration = options.duration || 4000;
    if (duration > 0) {
      timeoutRef.current = setTimeout(() => {
        triggerHide();
      }, duration);
    }
  };

  const hideToast = () => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setIsVisible(false);
    // Keep toastOptions until animation is complete
    setTimeout(() => {
      setToastOptions(null);
    }, 200);
  };

  const registerHideCallback = (callback: () => void) => {
    triggerHideCallbackRef.current = callback;
  };

  const triggerHide = () => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Trigger the Toast component's handleHide animation
    if (triggerHideCallbackRef.current) {
      triggerHideCallbackRef.current();
    } else {
      // Fallback if callback isn't set
      hideToast();
    }
  };

  return (
    <ToastContext.Provider
      value={{
        showToast,
        hideToast,
        triggerHide,
        registerHideCallback,
        isVisible,
        toastOptions,
      }}
    >
      {children}
    </ToastContext.Provider>
  );
};

export default ToastProvider;
