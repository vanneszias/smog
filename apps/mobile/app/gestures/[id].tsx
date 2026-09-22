import { Badge, Button, Text, VideoPlayer } from "@smog/ui-native";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { useGesture } from "@/data/gestures";

const LOAD_ERROR = "Er ging iets mis bij het laden van dit gebaar.";
const RETRY_LABEL = "Probeer opnieuw";

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
        </View>
      ) : null}
    </ScrollView>
  );
}
