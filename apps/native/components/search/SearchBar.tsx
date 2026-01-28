import { Ionicons } from "@expo/vector-icons";
import {
  BORDER_RADIUS,
  FONT_SIZE,
  HIT_SLOP,
  ICON_SIZE,
  SEARCHBAR_HEIGHT,
  SPACING,
} from "@smog/styles";
import { useCallback, useMemo, useRef, useState } from "react";
import type { TextStyle, ViewStyle } from "react-native";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onSubmit?: (query: string) => void;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  isLoading?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  showClearButton?: boolean;
  onClear?: () => void;
  value?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  showCancelButton?: boolean;
  onCancel?: () => void;
}

// Make the entire SearchBar area clickable to focus the TextInput
const SearchBar = ({
  onSearch,
  onSubmit,
  containerStyle,
  inputStyle,
  isLoading = false,
  placeholder,
  autoFocus = false,
  showClearButton = true,
  onClear,
  value,
  onFocus,
  onBlur,
  showCancelButton = false,
  onCancel,
  ref,
}: SearchBarProps & { ref?: React.Ref<TextInput> }) => {
  const { theme } = useTheme();
  const [internalQuery, setInternalQuery] = useState("");
  const searchQuery = value !== undefined ? value : internalQuery;
  const { t } = useTranslation();

  // Ref for focusing the TextInput when the container is pressed
  const inputRef = useRef<TextInput>(null);

  // Merge forwarded ref and local ref
  const setInputRef = (instance: TextInput | null) => {
    if (typeof ref === "function") {
      ref(instance);
    } else if (ref) {
      ref.current = instance;
    }
    inputRef.current = instance;
  };

  const handleSearch = useCallback(() => {
    onSearch(searchQuery);
    onSubmit?.(searchQuery);
  }, [onSearch, onSubmit, searchQuery]);

  const handleClear = useCallback(() => {
    if (value === undefined) {
      setInternalQuery("");
    }
    onClear?.();
  }, [onClear, value]);

  const handleTextChange = useCallback(
    (text: string) => {
      if (value === undefined) {
        setInternalQuery(text);
      }
      onSearch(text);
    },
    [onSearch, value]
  );

  const showClear = useMemo(
    () => showClearButton && searchQuery.length > 0,
    [showClearButton, searchQuery.length]
  );

  const shouldShowClearButton = showClear && !isLoading;

  const placeholderText = placeholder || t("search.placeholder");

  const handleContainerPress = useCallback(() => {
    inputRef.current?.focus?.();
  }, []);

  const handleCancel = useCallback(() => {
    inputRef.current?.blur();
    onCancel?.();
  }, [onCancel]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.searchContainer}>
        <TouchableOpacity
          accessibilityLabel={placeholderText}
          accessibilityRole="search"
          accessible={true}
          activeOpacity={1}
          onPress={handleContainerPress}
          style={[
            styles.inputContainer,
            { backgroundColor: theme.card },
            containerStyle,
          ]}
        >
          <Ionicons
            color={theme.textLight}
            name="search"
            size={ICON_SIZE.sm}
            style={styles.searchIcon}
          />
          <TextInput
            autoCapitalize="none"
            autoCorrect={true}
            autoFocus={autoFocus}
            clearButtonMode="never"
            onBlur={onBlur}
            onChangeText={handleTextChange}
            onFocus={onFocus}
            onSubmitEditing={handleSearch}
            placeholder={placeholderText}
            placeholderTextColor={theme.textLight}
            pointerEvents="auto"
            ref={setInputRef}
            returnKeyType="search"
            style={[
              styles.input,
              {
                color: theme.text,
              },
              inputStyle,
            ]}
            value={searchQuery}
          />
          {!!isLoading && (
            <ActivityIndicator
              color={theme.primary}
              size="small"
              style={styles.loadingIndicator}
            />
          )}
          {shouldShowClearButton ? (
            <TouchableOpacity
              hitSlop={HIT_SLOP.md}
              onPress={handleClear}
              style={styles.clearButton}
            >
              <Ionicons
                color={theme.textLight}
                name="close-circle"
                size={ICON_SIZE.md}
              />
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      </View>
      {!!showCancelButton && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
        >
          <TouchableOpacity
            accessibilityLabel={t("common.cancel")}
            accessibilityRole="button"
            hitSlop={HIT_SLOP.md}
            onPress={handleCancel}
            style={styles.cancelButton}
          >
            <Text style={[styles.cancelText, { color: theme.primary }]}>
              {t("common.cancel")}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

SearchBar.displayName = "SearchBar";

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  searchContainer: {
    flex: 1,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: SEARCHBAR_HEIGHT,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
  },
  searchIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    paddingVertical: 0,
  },
  loadingIndicator: {
    marginLeft: SPACING.sm,
  },
  clearButton: {
    marginLeft: SPACING.sm,
    padding: SPACING.xs / 2,
  },
  cancelButton: {
    marginLeft: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  cancelText: {
    fontSize: FONT_SIZE.md,
  },
});

export default SearchBar;
