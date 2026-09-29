import Ionicons from "@expo/vector-icons/Ionicons";
import { MenuView, type NativeActionEvent } from "@react-native-menu/menu";
import { ICON_SIZE } from "@smog/styles";
import { useCallback } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";

interface MenuAction {
  id: string;
  image?: string;
  title: string;
}

interface HeaderMenuButtonProps {
  actions: MenuAction[];
  onPressAction: (event: string) => void;
}

/**
 * Consistent menu button used in app screen headers.
 * Renders a 36×36 rounded icon button with `ellipsis-horizontal` on all platforms.
 */
const HeaderMenuButton = ({
  actions,
  onPressAction,
}: HeaderMenuButtonProps) => {
  const { theme } = useTheme();

  const handlePressAction = useCallback(
    ({ nativeEvent }: NativeActionEvent): void => {
      onPressAction(nativeEvent.event);
    },
    [onPressAction]
  );

  const menuActions = actions.map((action) => ({
    id: action.id,
    image: action.image,
    title: action.title,
  }));

  return (
    <MenuView
      actions={menuActions}
      onPressAction={handlePressAction}
      shouldOpenOnLongPress={false}
    >
      <View style={[styles.button, { backgroundColor: theme.card }]}>
        <Ionicons
          color={theme.text}
          name={
            Platform.OS === "ios" ? "ellipsis-horizontal" : "ellipsis-vertical"
          }
          size={ICON_SIZE.md}
        />
      </View>
    </MenuView>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
});

export default HeaderMenuButton;
