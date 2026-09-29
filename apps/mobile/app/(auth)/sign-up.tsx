import type { ReactElement } from "react";
import { AuthScreen } from "@/auth/auth-screen";

export default function SignUpScreen(): ReactElement {
  return <AuthScreen mode="signUp" />;
}
