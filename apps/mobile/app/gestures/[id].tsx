import { Badge, Button, Sheet, Text, VideoPlayer } from "@smog/ui-native";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useFavorites } from "@/data/favorites";
import { useGesture } from "@/data/gestures";
import { addToList, MAX_LIST_ITEMS, useLists } from "@/data/lists";
import { trackEvent } from "@/lib/analytics";
import { useSession } from "@/lib/session";

const LOAD_ERROR = "Er ging iets mis bij het laden van dit gebaar.";
const RETRY_LABEL = "Probeer opnieuw";

const ADD_TO_LIST_ERROR = "Niet gelukt";
const LIST_FULL_LABEL = `Lijst is vol (max. ${MAX_LIST_ITEMS})`;

/**
 * The list picker `packages/ui-native/src/components/Sheet.tsx`'s own
 * comment names as one of this component's two intended callers (the other
 * is Task 10's category filter): every one of the account's lists, each row
 * adding this gesture to it on press.
 *
 * **A list already at {@link MAX_LIST_ITEMS} is shown as full and its row is
 * disabled**, rather than only reporting the server's refusal after the
 * tap — the task brief's own requirement, and the one place in this app
 * that needs it, since `useLists`'s `itemCount` is already known before any
 * gesture is ever picked to add.
 *
 * **A refusal for any other reason is rendered, not swallowed.** The first
 * version of this handler was a `try { … } finally { … }` with no `catch`,
 * which is the exact defect Task 8 shipped and fixed on `sign-up.tsx`: a
 * `full`, `signed-out` or network refusal became an unhandled rejection, the
 * row silently did nothing, and the person had no way to tell a failed tap
 * from a slow one.
 */
function AddToListSheet({
  gestureId,
  onClose,
  open,
}: {
  gestureId: string;
  onClose: () => void;
  open: boolean;
}) {
  const { data: lists, loading } = useLists();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [erroredId, setErroredId] = useState<string | null>(null);

  const handleAdd = async (listId: string) => {
    setAddingId(listId);
    setErroredId(null);

    try {
      await addToList({ gestureId, id: listId });
      trackEvent("gesture_collection_changed", {
        action: "added",
        collection: "list",
        gesture_id: gestureId,
        source: "gesture_detail",
      });
      setAddedId(listId);
    } catch (error) {
      console.error("[gestures] Failed to add the gesture to the list:", error);
      setErroredId(listId);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Sheet onClose={onClose} open={open} title="Aan lijst toevoegen">
      {loading ? <Text>Laden…</Text> : null}
      {!loading && (lists === null || lists.length === 0) ? (
        <Text testID="no-lists" variant="muted">
          Je hebt nog geen lijsten. Maak er een op het tabblad Lijsten.
        </Text>
      ) : null}
      {(lists ?? []).map((list) => {
        const isFull = list.itemCount >= MAX_LIST_ITEMS;
        const status =
          erroredId === list.id
            ? ADD_TO_LIST_ERROR
            : addedId === list.id
              ? "Toegevoegd"
              : addingId === list.id
                ? "Bezig…"
                : isFull
                  ? LIST_FULL_LABEL
                  : "";

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isFull }}
            className="flex-row items-center justify-between border-border-subtle border-b py-md"
            disabled={isFull}
            key={list.id}
            onPress={() => handleAdd(list.id)}
            testID={`add-to-list-${list.id}`}
          >
            <Text>{list.name}</Text>
            <Text testID={`add-to-list-${list.id}-status`} variant="muted">
              {status}
            </Text>
          </Pressable>
        );
      })}
    </Sheet>
  );
}

/**
 * One gesture: its video, or the labelled placeholder `VideoPlayer` already
 * renders for a `playbackId` that is absent — a gesture still processing, or
 * one that never got a video, is an ordinary state in this data set, not an
 * error. Only a failed *request* gets the retry control below.
 */
export default function GestureDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id)
    ? (params.id[0] ?? "")
    : (params.id ?? "");

  const { data: gesture, error, loading, refetch } = useGesture(id);
  const { ids: favoriteIds, toggle: toggleFavorite } = useFavorites();
  const { user } = useSession();
  const [listSheetOpen, setListSheetOpen] = useState(false);
  const isFavorite = favoriteIds.includes(id);

  /**
   * Once per id, when the gesture has loaded — a `useRef` rather than a
   * dependency array keyed on `gesture`'s identity, because a refetch of the
   * same gesture (`refetch` above) hands back a new object and would
   * otherwise read as a second view. Biome's exhaustive-deps rule (this
   * repo lints with Biome, not eslint) rejects a dependency array that
   * knowingly omits a value the effect reads, so this is the accepted
   * fallback rather than a suppression comment.
   */
  const reportedGestureId = useRef<string | null>(null);
  useEffect(() => {
    if (gesture && reportedGestureId.current !== id) {
      reportedGestureId.current = id;
      trackEvent("gesture_viewed", { gesture_id: id, source: "direct" });
    }
  }, [gesture, id]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-md p-lg"
    >
      <Button onPress={() => router.back()} testID="back" variant="secondary">
        Terug
      </Button>

      {loading ? (
        <Text
          accessibilityLabel="Gebaar laden"
          accessibilityRole="progressbar"
          testID="loading"
        >
          Laden…
        </Text>
      ) : null}

      {!loading && error ? (
        <View className="flex-1 items-center justify-center gap-md">
          <Text className="text-danger" testID="gesture-error">
            {LOAD_ERROR}
          </Text>
          <Button onPress={refetch} testID="retry">
            {RETRY_LABEL}
          </Button>
        </View>
      ) : null}

      {!(loading || error) && gesture ? (
        <View className="gap-md">
          <Text size="xl" variant="heading">
            {gesture.name}
          </Text>
          <VideoPlayer
            onPlaybackEnd={() =>
              trackEvent("video_playback_completed", { gesture_id: id })
            }
            playbackId={gesture.playbackId ?? null}
            title={gesture.name}
          />
          {gesture.categories && gesture.categories.length > 0 ? (
            <View className="flex-row flex-wrap gap-xs">
              {gesture.categories.map((category) => (
                <Badge key={category.id}>{category.name}</Badge>
              ))}
            </View>
          ) : null}

          <View className="flex-row gap-sm">
            <Button
              accessibilityState={{ selected: isFavorite }}
              onPress={() => toggleFavorite(id)}
              testID="toggle-favorite"
              variant={isFavorite ? "primary" : "secondary"}
            >
              {isFavorite ? "♥ Favoriet" : "♡ Favoriet"}
            </Button>
            {user === null ? null : (
              <Button
                onPress={() => setListSheetOpen(true)}
                testID="open-add-to-list"
                variant="secondary"
              >
                Aan lijst toevoegen
              </Button>
            )}
          </View>
        </View>
      ) : null}

      {listSheetOpen ? (
        <AddToListSheet
          gestureId={id}
          onClose={() => setListSheetOpen(false)}
          open={listSheetOpen}
        />
      ) : null}
    </ScrollView>
  );
}
