import type { ReactElement } from "react";
import { AuthScreen } from "@/auth/auth-screen";

export default function ForgotPasswordScreen(): ReactElement {
  return <AuthScreen mode="forgotPassword" />;
}
