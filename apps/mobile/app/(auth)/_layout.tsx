import { useTranslation } from "@smog/i18n/react";
import { IconButton, useColor } from "@smog/ui-native";
import { Stack, useRouter } from "expo-router";
import X from "lucide-react-native/icons/x";
import { type ReactElement, useCallback } from "react";

/** Sign in, sign up and forgot password, as a modal stack. */
export default function AuthLayout(): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const background = useColor("background");
  const foreground = useColor("foreground");
  const primary = useColor("primary");
  const close = useCallback(() => router.dismissAll(), [router]);
  const headerRight = useCallback(
    () => <IconButton icon={<X />} label={t("a11y.close")} onPress={close} />,
    [close, t]
  );
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: background },
        headerRight,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: background },
        headerTintColor: primary,
        headerTitle: "",
        headerTitleStyle: { color: foreground },
      }}
    />
  );
}
