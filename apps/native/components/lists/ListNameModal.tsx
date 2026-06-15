import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, FONT_SIZE, FONT_WEIGHT, SPACING } from "@smog/styles";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";

interface ListNameModalProps {
  initialName?: string;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  title: string;
  visible: boolean;
}

export function ListNameModal({
  initialName = "",
  isSaving = false,
  onClose,
  onSave,
  title,
  visible,
}: ListNameModalProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (visible) {
      setName(initialName);
    }
  }, [initialName, visible]);

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {
        if (!isSaving) {
          onClose();
        }
      }}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <Pressable
          disabled={isSaving}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.background,
              borderColor: theme.border,
            },
          ]}
        >
          <View
            style={[styles.icon, { backgroundColor: `${theme.primary}14` }]}
          >
            <Ionicons color={theme.primary} name="list" size={24} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <TextInput
            autoFocus
            editable={!isSaving}
            maxLength={80}
            onChangeText={setName}
            onSubmitEditing={() => onSave(name)}
            placeholder={t("lists.newListPlaceholder")}
            placeholderTextColor={theme.textLight}
            returnKeyType="done"
            style={[
              styles.input,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            value={name}
          />
          <View style={styles.actions}>
            <TouchableOpacity
              disabled={isSaving}
              onPress={onClose}
              style={styles.cancelButton}
            >
              <Text style={[styles.cancelText, { color: theme.textLight }]}>
                {t("common.cancel")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!name.trim() || isSaving}
              onPress={() => onSave(name)}
              style={[
                styles.saveButton,
                { backgroundColor: theme.primary },
                !name.trim() || isSaving ? styles.disabled : null,
              ]}
            >
              {isSaving ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.saveText}>{t("common.save")}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.42)",
    flex: 1,
    justifyContent: "center",
    padding: SPACING.lg,
  },
  card: {
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 440,
    padding: SPACING.lg,
    width: "100%",
  },
  icon: {
    alignItems: "center",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    marginBottom: SPACING.md,
    width: 48,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: SPACING.md,
  },
  input: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    fontSize: FONT_SIZE.md,
    height: 52,
    paddingHorizontal: SPACING.md,
  },
  actions: {
    flexDirection: "row",
    gap: SPACING.sm,
    justifyContent: "flex-end",
    marginTop: SPACING.lg,
  },
  cancelButton: {
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: SPACING.md,
  },
  cancelText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  saveButton: {
    alignItems: "center",
    borderRadius: BORDER_RADIUS.round,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: SPACING.lg,
  },
  saveText: {
    color: "#ffffff",
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
  },
  disabled: {
    opacity: 0.42,
  },
});
