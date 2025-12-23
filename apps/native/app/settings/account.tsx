import { ScreenWithToast } from "@/components/common";
import AccountSettingsScreen from "@/screens/settings/AccountSettingsScreen";

export default function Account() {
  return (
    <ScreenWithToast>
      <AccountSettingsScreen />
    </ScreenWithToast>
  );
}
