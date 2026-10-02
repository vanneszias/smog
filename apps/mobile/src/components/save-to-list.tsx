import { useTranslation } from "@smog/i18n/react";
import { type MembershipChange, useListMembership } from "@smog/lists/client";
import { LIST_NAME_MAX } from "@smog/lists/schema";
import { IconButton, ListPicker, useToast } from "@smog/ui-native";
import ListPlus from "lucide-react-native/icons/list-plus";
import { type ReactElement, useCallback, useState } from "react";

/**
 * The gesture screen's "Save to list" header button and its ListPicker,
 * over `useListMembership` (which lists hold the gesture, asked only while
 * the picker is open): a checkbox per list and a field that creates a list
 * with the gesture in it. Only toasts are added here.
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
  const [open, setOpen] = useState(false);
  const { createWith, lists, toggle } = useListMembership(gestureId, {
    enabled: open,
    source: "gesture_detail",
  });
  const show = useCallback(() => setOpen(true), []);

  const report = useCallback(
    (change: Promise<MembershipChange | null>) => {
      change
        .then((done) => {
          if (done) {
            toast({
              title: t(
                done.action === "added" ? "lists.addedTo" : "lists.removedFrom",
                { name: done.name }
              ),
              variant: "success",
            });
          }
        })
        .catch((error: unknown) => {
          console.error("[lists] Failed to change a list:", error);
          toast({ title: t("states.actionFailed"), variant: "danger" });
        });
    },
    [t, toast]
  );
  const onToggle = useCallback(
    (listId: string) => report(toggle(listId)),
    [report, toggle]
  );
  const onCreate = useCallback(
    (name: string) => report(createWith(name)),
    [createWith, report]
  );

  return (
    <>
      <IconButton
        icon={<ListPlus />}
        label={t("lists.addToList")}
        onPress={show}
        testID="save-to-list"
        variant="ghost"
      />
      <ListPicker
        description={gestureName}
        lists={lists}
        nameMaxLength={LIST_NAME_MAX}
        onCreate={onCreate}
        onOpenChange={setOpen}
        onToggle={onToggle}
        open={open}
        testID="list-picker"
      />
    </>
  );
}
