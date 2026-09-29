import type { ReactElement } from "react";
import { AuthScreen } from "@/auth/auth-screen";

export default function SignInScreen(): ReactElement {
  return <AuthScreen mode="signIn" />;
}
