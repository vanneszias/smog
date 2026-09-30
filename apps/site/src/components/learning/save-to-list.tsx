import { useTranslation } from "@smog/i18n/react";
import { type UseListResult, useList, useLists } from "@smog/lists/client";
import { LIST_NAME_MAX } from "@smog/lists/schema";
import {
  Button,
  ListPicker,
  type ListPickerList,
  useToast,
} from "@smog/ui-web";
import { ListPlus } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Flags = Record<string, boolean>;

/** `flags` without `key` (only when it holds `value`, if one is given). */
function withoutKey(flags: Flags, key: string, value?: boolean): Flags {
  if (!(key in flags) || (value !== undefined && flags[key] !== value)) {
    return flags;
  }
  const { [key]: _removed, ...rest } = flags;
  return rest;
}

interface Membership {
  contains: boolean;
  list: UseListResult;
}

/**
 * One list's membership of the gesture, from `useList` (the device for a
 * guest list, the API otherwise), reported to the picker. Rendered only
 * while the picker is open, so a closed picker loads no list details.
 */
function ListMembership({
  gestureId,
  id,
  onReport,
}: {
  gestureId: string;
  id: string;
  onReport: (id: string, membership: Membership) => void;
}): null {
  const list = useList(id);
  const contains =
    list.list?.items.some((item) => item.id === gestureId) ?? false;
  useEffect(() => {
    onReport(id, { contains, list });
  });
  return null;
}

/**
 * "Save to list": the kit ListPicker with a checkbox per list (added or
 * removed at once, through `useList`) and a field that creates a list with
 * the gesture in it.
 */
export function SaveToList({
  gestureId,
  gestureName,
}: {
  gestureId: string;
  gestureName: string;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { create, lists } = useLists();
  const [open, setOpen] = useState(false);
  const [contains, setContains] = useState<Flags>({});
  // What the user just asked for, until the list's data agrees.
  const [pending, setPending] = useState<Flags>({});
  const memberships = useRef(new Map<string, Membership>());
  // A list created here gets the gesture once its membership reports.
  const [addTo, setAddTo] = useState<string | null>(null);

  const fail = useCallback(
    (error: unknown): void => {
      console.error("[lists] Failed to change a list:", error);
      toast({ title: t("states.actionFailed"), variant: "danger" });
    },
    [t, toast]
  );

  const report = useCallback(
    (id: string, membership: Membership): void => {
      memberships.current.set(id, membership);
      setContains((current) =>
        current[id] === membership.contains
          ? current
          : { ...current, [id]: membership.contains }
      );
      setPending((current) => withoutKey(current, id, membership.contains));
      if (addTo === id && membership.list.status === "ready") {
        setAddTo(null);
        membership.list.addItem(gestureId).catch(fail);
      }
    },
    [addTo, fail, gestureId]
  );

  const toggle = useCallback(
    (listId: string): void => {
      const membership = memberships.current.get(listId);
      if (!membership) {
        return;
      }
      const name = lists.find((list) => list.id === listId)?.name ?? "";
      const add = !(pending[listId] ?? membership.contains);
      setPending((current) => ({ ...current, [listId]: add }));
      const run = add
        ? membership.list.addItem(gestureId)
        : membership.list.removeItem(gestureId);
      run
        .then(() => {
          toast({
            title: t(add ? "lists.added" : "lists.removed", { name }),
            variant: "success",
          });
        })
        .catch((error: unknown) => {
          setPending((current) => withoutKey(current, listId));
          fail(error);
        });
    },
    [fail, gestureId, lists, pending, t, toast]
  );

  const createList = useCallback(
    (name: string): void => {
      create({ name })
        .then((created) => setAddTo(created.id))
        .catch(fail);
    },
    [create, fail]
  );

  const options = useMemo<ListPickerList[]>(
    () =>
      lists.map((list) => ({
        contains: pending[list.id] ?? contains[list.id] ?? false,
        id: list.id,
        name: list.name,
      })),
    [contains, lists, pending]
  );

  return (
    <>
      <ListPicker
        description={gestureName}
        lists={options}
        nameMaxLength={LIST_NAME_MAX}
        onCreate={createList}
        onOpenChange={setOpen}
        onToggle={toggle}
        open={open}
      >
        <Button icon={<ListPlus />} variant="secondary">
          {t("lists.addToList")}
        </Button>
      </ListPicker>
      {open || addTo
        ? lists.map((list) => (
            <ListMembership
              gestureId={gestureId}
              id={list.id}
              key={list.id}
              onReport={report}
            />
          ))
        : null}
    </>
  );
}
