import { useTranslation } from "@smog/i18n/react";
import { useList, useLists } from "@smog/lists/client";
import { LIST_NAME_MAX } from "@smog/lists/schema";
import { IconButton, ListPicker, useToast } from "@smog/ui-native";
import ListPlus from "lucide-react-native/icons/list-plus";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

interface Membership {
  add: () => Promise<void>;
  contains: boolean;
  ready: boolean;
  remove: () => Promise<void>;
}

/**
 * Whether one list holds the gesture, through `useList` (device lists for
 * guests, the account's otherwise), reported to the picker. Mounted per
 * list only while the picker is open.
 */
function ListMembership({
  gestureId,
  listId,
  onChange,
}: {
  gestureId: string;
  listId: string;
  onChange: (listId: string, membership: Membership | null) => void;
}): null {
  const { addItem, list, removeItem, status } = useList(listId);
  const contains = list?.items.some((item) => item.id === gestureId) ?? false;
  const ready = status === "ready" && list !== undefined;
  useEffect(() => {
    onChange(listId, {
      add: () => addItem(gestureId),
      contains,
      ready,
      remove: () => removeItem(gestureId),
    });
  }, [addItem, contains, gestureId, listId, onChange, ready, removeItem]);
  useEffect(() => () => onChange(listId, null), [listId, onChange]);
  return null;
}

/**
 * The gesture screen's "Save to list" header button and its ListPicker:
 * a checkbox per list (adds or takes the gesture out) and a field that
 * creates a list with the gesture in it.
 */
export function SaveToList({
  gestureId,
  gestureName,
}: {
  gestureId: string;
  gestureName: string;
}): ReactElement {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { create, lists } = useLists();
  const [open, setOpen] = useState(false);
  const [memberships, setMemberships] = useState<
    ReadonlyMap<string, Membership>
  >(() => new Map());
  const [addTo, setAddTo] = useState<string | null>(null);
  const busy = useRef(new Set<string>());
  const show = useCallback(() => setOpen(true), []);

  const onChange = useCallback(
    (listId: string, membership: Membership | null) => {
      setMemberships((current) => {
        const next = new Map(current);
        if (membership) {
          next.set(listId, membership);
        } else {
          next.delete(listId);
        }
        return next;
      });
    },
    []
  );
  const fail = useCallback(
    (error: unknown) => {
      console.error("[lists] Failed to change a list:", error);
      toast({ title: t("states.actionFailed"), variant: "danger" });
    },
    [t, toast]
  );
  const nameOf = useCallback(
    (listId: string) => lists.find((list) => list.id === listId)?.name ?? "",
    [lists]
  );

  const toggle = useCallback(
    (listId: string) => {
      const membership = memberships.get(listId);
      if (!membership?.ready || busy.current.has(listId)) {
        return;
      }
      busy.current.add(listId);
      const name = nameOf(listId);
      const change = membership.contains
        ? membership.remove().then(() => t("lists.removedFrom", { name }))
        : membership.add().then(() => t("lists.addedTo", { name }));
      change
        .then((title) => toast({ title, variant: "success" }))
        .catch(fail)
        .finally(() => busy.current.delete(listId));
    },
    [fail, memberships, nameOf, t, toast]
  );

  const onCreate = useCallback(
    (name: string) => {
      create({ name })
        .then((list) => setAddTo(list.id))
        .catch(fail);
    },
    [create, fail]
  );
  // A new list gets the gesture once its membership has loaded.
  useEffect(() => {
    const membership = addTo ? memberships.get(addTo) : undefined;
    if (!(addTo && membership?.ready)) {
      return;
    }
    setAddTo(null);
    if (!membership.contains) {
      toggle(addTo);
    }
  }, [addTo, memberships, toggle]);

  return (
    <>
      <IconButton
        icon={<ListPlus />}
        label={t("lists.addToList")}
        onPress={show}
        testID="save-to-list"
        variant="ghost"
      />
      {open || addTo
        ? lists.map((list) => (
            <ListMembership
              gestureId={gestureId}
              key={list.id}
              listId={list.id}
              onChange={onChange}
            />
          ))
        : null}
      <ListPicker
        description={gestureName}
        lists={lists.map((list) => ({
          contains: memberships.get(list.id)?.contains ?? false,
          id: list.id,
          name: list.name,
        }))}
        nameMaxLength={LIST_NAME_MAX}
        onCreate={onCreate}
        onOpenChange={setOpen}
        onToggle={toggle}
        open={open}
        testID="list-picker"
      />
    </>
  );
}
