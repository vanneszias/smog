import { useTranslation } from "@smog/i18n/react";
import { IconButton, Surface, useColor } from "@smog/ui-native";
import { Stack, useRouter } from "expo-router";
import X from "lucide-react-native/icons/x";
import { type ReactElement, useCallback } from "react";

/**
 * Sign in, sign up and forgot password, as a modal stack: the header is the
 * green of the band under it, so the two read as one surface.
 */
export default function AuthLayout(): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const background = useColor("background");
  const green = useColor("primary");
  const onGreen = useColor("primaryForeground");
  const close = useCallback(() => router.dismissTo("/"), [router]);
  const headerRight = useCallback(
    () => (
      <Surface className="bg-transparent" tone="primary">
        <IconButton
          icon={<X />}
          label={t("a11y.close")}
          onPress={close}
          variant="ghost"
        />
      </Surface>
    ),
    [close, t]
  );
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: background },
        headerRight,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: green },
        headerTintColor: onGreen,
        headerTitle: "",
        headerTitleStyle: { color: onGreen },
        statusBarStyle: "light",
      }}
    />
  );
}
