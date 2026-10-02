import { useTranslation } from "@smog/i18n/react";
import Plus from "lucide-react-native/icons/plus";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import { type TextInput, View } from "react-native";
import { Button } from "../components/button";
import { Checkbox } from "../components/checkbox";
import { Field } from "../components/field";
import { Input } from "../components/input";
import { Sheet, SheetContent, SheetTrigger } from "../components/sheet";
import { Text } from "../components/text";

export interface ListPickerList {
  /** Whether the gesture is already in this list. */
  contains: boolean;
  id: string;
  name: string;
  /** Its state is loading or changing: the checkbox is disabled meanwhile. */
  pending?: boolean;
}

export interface ListPickerProps {
  /** The trigger: one pressable (a Button); optional when controlled with `open`. */
  children?: ReactElement;
  defaultOpen?: boolean;
  /** Supporting text under the title (e.g. the gesture's name). */
  description?: ReactNode;
  lists: readonly ListPickerList[];
  /** The longest list name the server accepts. */
  nameMaxLength?: number;
  /** Called with the trimmed name of a new list. */
  onCreate: (name: string) => void;
  onOpenChange?: (open: boolean) => void;
  /** Adds the gesture to the list or takes it out. */
  onToggle: (listId: string) => void;
  open?: boolean;
  /** On the sheet's content. */
  testID?: string;
  /** The sheet's title (`lists.addToList` by default). */
  title?: ReactNode;
}

/** "Save to list": a bottom sheet with a checkbox per list and a field that creates one. */
export function ListPicker({
  children,
  defaultOpen,
  description,
  lists,
  nameMaxLength,
  onCreate,
  onOpenChange,
  onToggle,
  open,
  testID,
  title,
}: ListPickerProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Sheet defaultOpen={defaultOpen} onOpenChange={onOpenChange} open={open}>
      {children ? <SheetTrigger>{children}</SheetTrigger> : null}
      <SheetContent
        description={description}
        testID={testID}
        title={title ?? t("lists.addToList")}
      >
        {lists.length === 0 ? (
          <Text tone="muted">{t("lists.noLists")}</Text>
        ) : (
          <View className="flex-col">
            {lists.map((list) => (
              <ListOption key={list.id} list={list} onToggle={onToggle} />
            ))}
          </View>
        )}
        <CreateListForm maxLength={nameMaxLength} onCreate={onCreate} />
      </SheetContent>
    </Sheet>
  );
}

function ListOption({
  list,
  onToggle,
}: {
  list: ListPickerList;
  onToggle: (listId: string) => void;
}): ReactElement {
  const toggle = useCallback((): void => {
    onToggle(list.id);
  }, [list.id, onToggle]);
  return (
    <Checkbox
      checked={list.contains}
      disabled={list.pending}
      label={list.name}
      onCheckedChange={toggle}
    />
  );
}

function CreateListForm({
  maxLength,
  onCreate,
}: {
  maxLength?: number;
  onCreate: (name: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const inputRef = useRef<TextInput>(null);
  const trimmed = name.trim();
  const submit = useCallback((): void => {
    if (trimmed) {
      onCreate(trimmed);
      setName("");
      inputRef.current?.focus();
    }
  }, [onCreate, trimmed]);
  return (
    <View className="flex-col gap-2 border-border-subtle border-t pt-4">
      <Field label={t("lists.newList")}>
        <Input
          autoCorrect={false}
          maxLength={maxLength}
          onChangeText={setName}
          onSubmitEditing={submit}
          placeholder={t("lists.newListPlaceholder")}
          ref={inputRef}
          returnKeyType="done"
          value={name}
        />
      </Field>
      <Button
        className="self-start"
        disabled={!trimmed}
        icon={<Plus />}
        onPress={submit}
        variant="secondary"
      >
        {t("lists.create")}
      </Button>
    </View>
  );
}
