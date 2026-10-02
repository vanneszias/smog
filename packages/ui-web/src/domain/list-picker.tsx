import { useTranslation } from "@smog/i18n/react";
import { Plus } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import { Button } from "../components/button";
import { Checkbox } from "../components/checkbox";
import { Field } from "../components/field";
import { Input } from "../components/input";
import { Sheet, SheetContent, SheetTrigger } from "../components/sheet";

export interface ListPickerList {
  /** Whether the gesture is already in this list. */
  contains: boolean;
  id: string;
  name: string;
  /** Its state is loading or changing: the checkbox is disabled meanwhile. */
  pending?: boolean;
}

export interface ListPickerProps {
  /** The trigger (one element, e.g. a Button); optional when controlled with `open`. */
  children?: ReactNode;
  defaultOpen?: boolean;
  /** Supporting text under the title (e.g. the gesture's name). */
  description?: ReactNode;
  lists: readonly ListPickerList[];
  /** The longest list name the server accepts. */
  nameMaxLength?: number;
  /** Called with the trimmed name of a new list. */
  onCreate: (name: string) => void;
  onOpenChange?: (open: boolean) => void;
  /** Adds the gesture to the list or takes it out (the caller knows which from `contains`). */
  onToggle: (listId: string) => void;
  open?: boolean;
  /** The sheet's title (`lists.addToList` by default). */
  title?: ReactNode;
}

/** "Save to list": a Sheet with a checkbox per list and a field that creates one. */
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
  title,
}: ListPickerProps): ReactNode {
  const { t } = useTranslation();
  return (
    <Sheet defaultOpen={defaultOpen} onOpenChange={onOpenChange} open={open}>
      {children ? <SheetTrigger asChild>{children}</SheetTrigger> : null}
      <SheetContent
        description={description}
        title={title ?? t("lists.addToList")}
      >
        {lists.length === 0 ? (
          <p className="text-body text-foreground-muted">
            {t("lists.noLists")}
          </p>
        ) : (
          <ul className="flex flex-col">
            {lists.map((list) => (
              <ListOption key={list.id} list={list} onToggle={onToggle} />
            ))}
          </ul>
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
}): ReactNode {
  const toggle = useCallback((): void => {
    onToggle(list.id);
  }, [list.id, onToggle]);
  return (
    <li className="flex min-h-touch items-center">
      <Checkbox
        checked={list.contains}
        disabled={list.pending}
        label={list.name}
        onCheckedChange={toggle}
      />
    </li>
  );
}

function CreateListForm({
  maxLength,
  onCreate,
}: {
  maxLength?: number;
  onCreate: (name: string) => void;
}): ReactNode {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = name.trim();
  const change = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    setName(event.target.value);
  }, []);
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      if (trimmed) {
        onCreate(trimmed);
        setName("");
        // The Create button is disabled again; keep focus in the form.
        inputRef.current?.focus();
      }
    },
    [onCreate, trimmed]
  );
  return (
    <form
      className="flex flex-col gap-2 border-border-subtle border-t pt-4"
      onSubmit={submit}
    >
      <Field label={t("lists.newList")}>
        <Input
          autoComplete="off"
          maxLength={maxLength}
          onChange={change}
          placeholder={t("lists.newListPlaceholder")}
          ref={inputRef}
          value={name}
        />
      </Field>
      <Button
        className="self-start"
        disabled={!trimmed}
        icon={<Plus />}
        type="submit"
        variant="secondary"
      >
        {t("lists.create")}
      </Button>
    </form>
  );
}
