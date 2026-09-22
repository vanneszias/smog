import {
  Button,
  GestureCard,
  GestureGrid,
  SearchBar,
  Text,
} from "@smog/ui-native";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useGestures } from "@/data/gestures";

const LOAD_ERROR = "Er ging iets mis bij het zoeken.";
const RETRY_LABEL = "Probeer opnieuw";
/**
 * The idle state, before anything has been typed. Not fetching here is the
 * point: `useGestures({ q: "" })` would hand back the browse tab's whole
 * unfiltered first page, which is not what an empty search box means on
 * this tab.
 */
const PROMPT = "Typ om een gebaar te zoeken";

/**
 * The Search tab. `SearchBar` already debounces and reports the empty
 * string on a cleared field — see that component's own comment — so this
 * screen only has to decide what to render for each length of query: idle,
 * loading, failed, or a (possibly empty) set of results. Failing and
 * finding nothing render differently for the same reason the Gestures tab's
 * do; see that screen's own comment.
 */
export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const enabled = query.trim() !== "";

  const { data, error, loading, refetch } = useGestures({
    enabled,
    q: query,
  });

  return (
    <View className="flex-1 gap-md bg-background p-lg">
      <Text size="xl" variant="heading">
        Zoeken
      </Text>
      <SearchBar onSearch={setQuery} placeholder="Zoek een gebaar" />

      {enabled ? null : (
        <View className="flex-1 items-center justify-center">
          <Text variant="muted">{PROMPT}</Text>
        </View>
      )}

      {enabled && error ? (
        <View className="flex-1 items-center justify-center gap-md">
          <Text className="text-danger" testID="search-error">
            {LOAD_ERROR}
          </Text>
          <Button onPress={refetch} testID="retry">
            {RETRY_LABEL}
          </Button>
        </View>
      ) : null}

      {enabled && !error ? (
        <GestureGrid
          className="flex-1"
          gestures={data?.docs ?? []}
          loading={loading}
          renderItem={(gesture) => (
            <GestureCard
              gesture={gesture}
              onPress={(id) => router.push(`/gestures/${id}`)}
            />
          )}
        />
      ) : null}
    </View>
  );
}
