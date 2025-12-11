import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, ICON_SIZE, SHADOWS, SPACING } from "@smog/styles";
import type React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import BottomSheet from "@/components/bottom-sheet/BottomSheet";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import { typography } from "@/utils/typography";

type OptionsBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSettingsPress: () => void;
  onAboutPress: () => void;
  onContactPress: () => void;
};

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
});

export default OptionsBottomSheet;
