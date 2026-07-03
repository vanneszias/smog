import Ionicons from "@expo/vector-icons/Ionicons";
import { MenuView } from "@react-native-menu/menu";
import { ICON_SIZE } from "@smog/styles";
import { Platform, StyleSheet, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";

interface MenuAction {
  id: string;
  title: string;
  image?: string;
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

  const menuActions = actions.map((action) => ({
    id: action.id,
    title: action.title,
    image: action.image,
  }));

  return (
    <MenuView
      actions={menuActions}
      onPressAction={({ nativeEvent }) => onPressAction(nativeEvent.event)}
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
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default HeaderMenuButton;
