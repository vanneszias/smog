import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, ICON_SIZE, SHADOWS, SPACING } from "@smog/styles";
import type React from "react";
import {
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import BottomSheet from "@/components/bottom-sheet/BottomSheet";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import { typography } from "@/utils/typography";

interface OptionsBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  onSettingsPress: () => void;
  onAboutPress: () => void;
  onContactPress: () => void;
}

const OptionsBottomSheet: React.FC<OptionsBottomSheetProps> = ({
  visible,
  onClose,
  onSettingsPress,
  onAboutPress,
  onContactPress,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const handleButtonPress = (action: () => void) => {
    action();
    onClose(); // Simply call the onClose prop to dismiss
  };

  const handleFooterLinkPress = () => {
    Linking.openURL("https://zias.be");
  };

  return (
    <BottomSheet
      contentContainerStyle={styles.contentContainer}
      onClose={onClose}
      snapPoints={["30%"]}
      visible={visible}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => handleButtonPress(onSettingsPress)}
        style={[
          styles.button,
          { backgroundColor: theme.primary },
          SHADOWS.small,
        ]}
      >
        <Ionicons
          color={theme.background}
          name="settings-outline"
          size={ICON_SIZE.sm}
        />
        <Text style={[typography.buttonText, { color: theme.background }]}>
          {t("settings.title")}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => handleButtonPress(onAboutPress)}
        style={[
          styles.button,
          { backgroundColor: theme.primary },
          SHADOWS.small,
        ]}
      >
        <Ionicons
          color={theme.background}
          name="information-circle-outline"
          size={ICON_SIZE.sm}
        />
        <Text style={[typography.buttonText, { color: theme.background }]}>
          {t("about.title")}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => handleButtonPress(onContactPress)}
        style={[
          styles.button,
          { backgroundColor: theme.primary },
          SHADOWS.small,
        ]}
      >
        <Ionicons
          color={theme.background}
          name="call-outline"
          size={ICON_SIZE.sm}
        />
        <Text style={[typography.buttonText, { color: theme.background }]}>
          {t("contact.title")}
        </Text>
      </TouchableOpacity>

      <View style={styles.footerContainer}>
        <TouchableOpacity activeOpacity={0.7} onPress={handleFooterLinkPress}>
          <Text style={[styles.footerLink, { color: theme.textLight }]}>
            Gemaakt met ♡ door zias.be
          </Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginVertical: SPACING.xs,
    gap: SPACING.sm,
  },
  footerContainer: {
    marginVertical: SPACING.md,
    alignItems: "center",
    justifyContent: "center",
  },
  footerLink: {
    fontSize: 14,
    textDecorationLine: "underline",
    textAlign: "center",
  },
});

export default OptionsBottomSheet;
