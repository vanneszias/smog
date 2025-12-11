import type React from "react";
import Toast from "@/components/Toast";
import { useToast } from "@/context/ToastContext";

export const ToastContainer: React.FC = () => {
  const { isVisible, toastOptions, hideToast } = useToast();

  if (!toastOptions) {
    return null;
  }

  return (
    <Toast
      action={toastOptions.action}
      message={toastOptions.message}
      onHide={hideToast}
      type={toastOptions.type}
      visible={isVisible}
    />
  );
};

export default ToastContainer;
