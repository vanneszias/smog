import type { ReactElement } from "react";
import { AccountScreen } from "@/account/account-screen";

/** `settings/account`: the account screen (profile, methods, privacy, deletion). */
export default function AccountRoute(): ReactElement {
  return <AccountScreen />;
}
