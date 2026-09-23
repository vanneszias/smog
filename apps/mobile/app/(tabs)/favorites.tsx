import { EmptyState, GestureCard, GestureGrid, Text } from "@smog/ui-native";
import { router } from "expo-router";
import { View } from "react-native";
import { useFavoriteGestures, useFavorites } from "@/data/favorites";

const LOAD_ERROR = "Er ging iets mis bij het laden van je favorieten.";

/**
 * The Favorites tab.
 *
 * `useFavorites().ids` and `useFavoriteGestures(ids)` are two hooks rather
 * than one, on purpose: the first knows *which* ids are favourited and
 * where to write a change (device or account), the second only turns
 * whatever ids it is given into cards. Feeding the second the first's
 * output is what this screen does; a favourites-shaped list *inside* a
 * list screen (the list detail) never needs the first at all.
 *
 * **A stored id that no longer resolves is not rendered, and nothing here
 * has to notice that on its own.** `useFavoriteGestures` already filters to
 * the gestures `GET /api/gestures` actually returned — see that hook's own
 * comment — so a favourite an editor has since deactivated simply is not in
 * `data`, rather than appearing as a card with no name.
 */
export default function FavoritesScreen() {
  const { ids, loading: idsLoading, signedIn, toggle } = useFavorites();
  const { data, error, loading: gesturesLoading } = useFavoriteGestures(ids);

  const loading = idsLoading || (gesturesLoading && data.length === 0);

  return (
    <View className="flex-1 gap-md bg-background p-lg">
      <View className="gap-xs">
        <Text size="xl" variant="heading">
          Favorieten
        </Text>
        <Text testID="favorites-scope" variant="muted">
          {signedIn
            ? "Je favorieten zijn aan je account gekoppeld en staan op al je apparaten klaar."
            : "Je favorieten worden alleen op dit toestel bewaard. Meld je aan om ze overal terug te vinden."}
        </Text>
      </View>

      {error ? (
        <Text className="text-danger" testID="favorites-error">
          {LOAD_ERROR}
        </Text>
      ) : (
        <GestureGrid
          className="flex-1"
          empty={
            <EmptyState
              description="Tik op het hartje bij een gebaar om het hier terug te vinden."
              title="Nog geen favorieten"
            />
          }
          gestures={data}
          loading={loading}
          renderItem={(gesture) => (
            <GestureCard
              gesture={gesture}
              isFavorite={ids.includes(gesture.id)}
              onFavorite={toggle}
              onPress={(id) => router.push(`/gestures/${id}`)}
            />
          )}
          testID="favorites-list"
        />
      )}
    </View>
  );
}
