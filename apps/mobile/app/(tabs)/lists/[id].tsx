import { Badge, Button, Input, Switch, Text } from "@smog/ui-native";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";
import {
  deleteList,
  MAX_LIST_ITEMS,
  removeFromList,
  renameList,
  shareList,
  useList,
} from "@/data/lists";
import { trackEvent } from "@/lib/analytics";

const LOAD_ERROR = "Er ging iets mis bij het laden van deze lijst.";
const RETRY_LABEL = "Probeer opnieuw";
const UNAVAILABLE_GESTURE = "Dit gebaar is niet meer beschikbaar";

/**
 * One owned list: rename, share, delete, and the gestures on it.
 *
 * A row whose `gesture` is `null` — `data/lists.ts`'s own doc comment on
 * `ListItem` explains why that happens, a gesture an editor has since
 * deactivated — still renders, as {@link UNAVAILABLE_GESTURE}, with its
 * remove control intact. Review Focus item 5's rule for a list is the
 * opposite of the one for favourites: a list keeps the row so its owner can
 * see it and take it off, rather than letting the id quietly fall out.
 */
export default function ListDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id)
    ? (params.id[0] ?? "")
    : (params.id ?? "");

  const { data: list, error, loading, refetch } = useList(id);

  const [name, setName] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-lg">
        <Text
          accessibilityLabel="Lijst laden"
          accessibilityRole="progressbar"
          testID="loading"
        >
          Laden…
        </Text>
      </View>
    );
  }

  if (error || list === null) {
    return (
      <View className="flex-1 items-center justify-center gap-md bg-background p-lg">
        <Text className="text-danger" testID="list-error">
          {LOAD_ERROR}
        </Text>
        <Button onPress={refetch} testID="retry">
          {RETRY_LABEL}
        </Button>
      </View>
    );
  }

  const nameValue = name ?? list.name;
  const atCap = list.items.length >= MAX_LIST_ITEMS;

  const handleRename = async () => {
    const trimmed = nameValue.trim();

    if (trimmed === "" || trimmed === list.name) {
      return;
    }

    setSavingName(true);

    try {
      await renameList({
        description: list.description ?? undefined,
        id: list.id,
        name: trimmed,
      });
      refetch();
    } finally {
      setSavingName(false);
    }
  };

  const handleShare = async (next: boolean) => {
    setSharing(true);

    try {
      await shareList({
        id: list.id,
        visibility: next ? "shared" : "private",
      });
      refetch();
    } finally {
      setSharing(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(false);

    try {
      await deleteList({ confirmName, id: list.id });
      router.back();
    } catch {
      setDeleteError(true);
      setDeleting(false);
    }
  };

  const handleRemove = async (gestureId: string) => {
    setRemovingId(gestureId);

    try {
      await removeFromList({ gestureId, id: list.id });
      trackEvent("gesture_collection_changed", {
        action: "removed",
        collection: "list",
        gesture_id: gestureId,
        source: "gesture_list",
      });
      refetch();
    } catch (error) {
      console.error(
        "[lists] Failed to remove the gesture from the list:",
        error
      );
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <View className="flex-1 gap-md bg-background p-lg">
      <Button onPress={() => router.back()} testID="back" variant="secondary">
        Terug
      </Button>

      <View className="flex-row items-end gap-sm">
        <View className="flex-1">
          <Input
            label="Naam van de lijst"
            onChangeText={setName}
            testID="list-name"
            value={nameValue}
          />
        </View>
        <Button
          disabled={savingName || nameValue.trim() === ""}
          loading={savingName}
          onPress={handleRename}
          testID="save-name"
        >
          Opslaan
        </Button>
      </View>

      <Switch
        disabled={sharing}
        label="Delen met een link"
        onValueChange={handleShare}
        testID="share-toggle"
        value={list.visibility === "shared"}
      />

      {atCap ? (
        <Text className="text-foreground-muted" testID="list-full-notice">
          Deze lijst bevat het maximum van {MAX_LIST_ITEMS} gebaren.
        </Text>
      ) : null}

      <FlatList
        data={list.items}
        keyExtractor={(item) => item.gestureId}
        ListEmptyComponent={
          <Text variant="muted">Nog geen gebaren op deze lijst.</Text>
        }
        renderItem={({ item }) => (
          <View
            className="flex-row items-center justify-between border-border-subtle border-b py-sm"
            testID={`list-item-${item.gestureId}`}
          >
            {item.gesture === null ? (
              <Badge variant="warning">{UNAVAILABLE_GESTURE}</Badge>
            ) : (
              <Text className="min-w-0 flex-1" numberOfLines={1}>
                {item.gesture.name}
              </Text>
            )}
            <Button
              loading={removingId === item.gestureId}
              onPress={() => handleRemove(item.gestureId)}
              size="sm"
              testID={`remove-${item.gestureId}`}
              variant="secondary"
            >
              Verwijderen
            </Button>
          </View>
        )}
        testID="list-items"
      />

      <View className="gap-sm border-border-subtle border-t pt-md">
        <Text variant="muted">
          Typ de naam van de lijst om te bevestigen dat je hem wilt verwijderen.
        </Text>
        <Input
          label="Naam ter bevestiging"
          onChangeText={setConfirmName}
          testID="confirm-delete-name"
          value={confirmName}
        />
        {deleteError ? (
          <Text className="text-danger" testID="delete-error">
            Dat is niet gelukt. Controleer de naam en probeer het opnieuw.
          </Text>
        ) : null}
        <Button
          disabled={deleting || confirmName.trim() === ""}
          loading={deleting}
          onPress={handleDelete}
          testID="delete-list"
          variant="danger"
        >
          Lijst verwijderen
        </Button>
      </View>
    </View>
  );
}
